const path = require('path');
const { writeFileWithDir } = require('../../../utils/file-utils');
const { isJoinTableValid } = require('../../../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  snakeCase,
  pluralize,
} = require('../../../utils/word-utils');

const {
  getTableProperties,
  hasComplexHydration,
} = require('./repository-utils');

// Helper function to generate EventStore stream name
const getStreamName = (schema, table, className) =>
  `${kebabCase(className)}-stream`;

// Helper function to generate the rebuild from events method
const generateRebuildFromEventsMethod = (schema, table) => {
  const { className } = getTableProperties(schema, table);

  return `
  /**
   * Rebuilds the aggregate state from a series of events
   * @private
   */
  private rebuildFromEvents(events: any[], logContext: Record<string, unknown>): Snapshot${className}Props {
    try {
      // Initialize with default state
      let state: Partial<Snapshot${className}Props> = {};
      
      // Apply each event to rebuild the state
      for (const event of events) {
        switch (event.eventType) {
          case '${className}Created':
            state = { ...event.data };
            break;
          case '${className}Updated':
            state = { ...state, ...event.data };
            break;
          case '${className}Deleted':
            // Mark as deleted but keep the data for audit purposes
            state = { ...state, deleted: true, deletedAt: event.data.deletedAt };
            break;
          default:
            this.logger.warn(logContext, \`Unknown event type: \${event.eventType}\`);
        }
      }
      
      return state as Snapshot${className}Props;
    } catch (error) {
      this.logger.error(logContext, \`Failed to rebuild from events: \${error.message}\`);
      throw error;
    }
  }`;
};

function esdbRepositoryGet(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects, specialCols } =
    getTableProperties(schema, table);

  lines.push(`  // ✅ REQUIRED ABSTRACT METHOD: Implement the get method from SagaCommandRepository
  protected async get(
    user: IUserToken,
    identifier: string | number,
  ): Promise<I${className} | undefined> {
    const ${camelCase(primaryCol.name)} = identifier.toString();
    const tenant = user.tenant;`);
  lines.push(`    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'get',
      ${camelCase(primaryCol.name)}${primaryCol.type === 'string' ? '' : `.toString()`},
      user,
    );

    this.logger.debug(logContext, \`Getting ${camelCase(className)} by ${camelCase(primaryCol.name)}: \${${camelCase(primaryCol.name)}}\`);

    try {
      // Get ${camelCase(className)} from EventStore using entity-level stream (one stream per ${camelCase(className)})
      const streamName = this.buildStreamName(tenant || '', ${camelCase(primaryCol.name)});

      // Try to get the latest snapshot first using the specialized service
      const snapshot =
        await this.snapshotService.getLatestSnapshot<Snapshot${className}Props>(
          streamName,
        );


      if (!snapshot) {
        return undefined; // Not found
      }

      // Use the helper method for hydration
      const ${camelCase(className)} = ${hasComplexHydration(complexObjects, specialCols) ? 'await ' : ''}this.hydrateStored${className}(user, snapshot, logContext);

      this.logger.debug(logContext, \`Successfully retrieved ${camelCase(className)}: \${${camelCase(primaryCol.name)}}\`);
      return ${camelCase(className)};

    } catch (e) {
      this.logger.error(
        {
          ...logContext,
          ${camelCase(primaryCol.name)},
          tenant,
          username: user?.preferred_username,
          error: e instanceof Error ? e.message : 'Unknown error',
        },
        '${className} get error',
      );

      return undefined; // Not found on error
    }
  }

`);

  return lines;
}

function esdbRepositoryGetByCodes(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects, specialCols } =
    getTableProperties(schema, table);
  const pluralClassName = pluralize(className);
  const pluralPrimaryCol = pluralize(primaryCol.name);
  lines.push(`  async getByCodes(user: IUserToken, ${camelCase(pluralPrimaryCol)}: ${primaryCol.type}[]): Promise<I${className}[]> {
    if (!${camelCase(pluralPrimaryCol)} || ${camelCase(pluralPrimaryCol)}.length === 0) {
      return [];
    }

    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(COMPONENT_NAME, 'getByCodes', ${camelCase(pluralPrimaryCol)}.join(','), user);

    this.logger.debug(logContext, \`Getting ${camelCase(pluralClassName)} by codes: \${${camelCase(pluralPrimaryCol)}.join(', ')}\`);

    try {
`);
  lines.push(`      // Use Promise.all to parallelize individual get calls for optimal performance
      const ${camelCase(className)}Promises = ${camelCase(pluralPrimaryCol)}.map(async (code) => {
        try {
          return await this.get(user, code);
        } catch (error) {
          // Log warning but return undefined for failed retrievals
          this.logger.warn(
            logContext,
            \`Failed to get ${camelCase(className)} \${code}: \${error instanceof Error ? error.message : 'Unknown error'}\`,
          );
          return undefined;
        }
      });

      const ${camelCase(className)}Results = await Promise.all(${camelCase(className)}Promises);

      // Filter out undefined results (failed retrievals)
      const ${camelCase(pluralClassName)} = ${camelCase(className)}Results.filter(
        (${camelCase(className)}): ${camelCase(className)} is I${className} => ${camelCase(className)} !== undefined,
      );

      this.logger.debug(
        logContext,
        \`Successfully retrieved \${${camelCase(pluralClassName)}.length}/\${${camelCase(pluralize(primaryCol.name))}.length} ${camelCase(pluralClassName)} using Promise.all\`,
      );`);

  lines.push(`
      return ${camelCase(pluralClassName)};

    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          ${camelCase(pluralPrimaryCol)},
          username: user?.preferred_username,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${pluralClassName} by ${camelCase(pluralPrimaryCol)}',
      );

      if (error instanceof ${className}DomainException) {
        throw error;
      }

      throw new ${className}DomainException(${className}ExceptionMessage.notFound);
    }
  }
`);

  return lines;
}

function esdbRepositoryList(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects, specialCols, idxCols } =
    getTableProperties(schema, table);
  const pluralClassName = pluralize(className);

  lines.push(`  async list(
    user: IUserToken,
    pageOptions: List${className}PropsOptions = {},
  ): Promise<${className}Page> {
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'list',
      \`page:\${pageOptions.page || 1}\`,
      user,
    );

    this.logger.debug(
      logContext,
      \`Listing ${camelCase(pluralClassName)} with options: \${JSON.stringify(pageOptions)}\`,
    );

    try {
      // Check if we have the projection available and initialized
      if (this.${camelCase(className)}Projection.isReady()) {
        return this.listFromProjection(user, pageOptions, logContext);
      } else {
        // Log error and throw - projection should be available
        this.logger.error(
          logContext,
          '${className} projection is not available or not ready. Cannot list ${camelCase(pluralClassName)} without projection.',
        );
        throw new ${className}DomainException(
          ${className}ExceptionMessage.projectionNotAvailable ||
            ${className}ExceptionMessage.notFound,
        );
      }
    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          pageOptions,
          username: user?.preferred_username,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to list ${upperFirst(camelCase(pluralClassName))}',
      );

      if (error instanceof ${className}DomainException) {
        throw error;
      }

      throw new ${className}DomainException(${className}ExceptionMessage.notFound);
    }
  }

  /**
   * List ${camelCase(pluralClassName)} using the in-memory projection for optimal performance
   */
  private async listFromProjection(
    user: IUserToken,
    pageOptions: List${className}PropsOptions,
    logContext: Record<string, unknown>,
  ): Promise<${className}Page> {
    this.logger.debug(logContext, 'Using ${camelCase(className)} projection for listing');

    // Build filter from page options with proper typing
    const filter: {`);
  idxCols.forEach((col) => {
    lines.push(`      ${camelCase(col.name)}?: ${col.type};`);
  });
  lines.push(`    } = {};
`);

  idxCols.forEach((col) => {
    lines.push(`    if (pageOptions.${camelCase(col.name)}) {`);
    lines.push(`      filter.${camelCase(col.name)} = pageOptions.${camelCase(col.name)};
    }`);
  });

  lines.push(`
    // Get ${camelCase(pluralClassName)} from projection with proper null check
    const projection${upperFirst(camelCase(pluralClassName))} =
      await this.${camelCase(className)}Projection.get${upperFirst(camelCase(pluralClassName))}ForTenant(
        user.tenant || '',
        filter,
      );

    // Apply sorting
    const sorted${upperFirst(camelCase(pluralClassName))} = [...projection${upperFirst(camelCase(pluralClassName))}];
    if (pageOptions.orderBy) {
      sorted${upperFirst(camelCase(pluralClassName))}.sort((a, b) => {
        const field = pageOptions.orderBy! as keyof Snapshot${className}Props;
        const aValue = a[field];
        const bValue = b[field];

        // Handle different types safely
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return aValue.localeCompare(bValue);
        }

        // Convert to string for comparison, handling objects
        const aStr =
          aValue === null || aValue === undefined
            ? ''
            : typeof aValue === 'object'
              ? JSON.stringify(aValue)
              : String(aValue);
        const bStr =
          bValue === null || bValue === undefined
            ? ''
            : typeof bValue === 'object'
              ? JSON.stringify(bValue)
              : String(bValue);

        return aStr.localeCompare(bStr);
      });
    }

    // Apply pagination
    const page = pageOptions.page || 1;
    const size = pageOptions.size || 20;
    const skip = (page - 1) * size;

    const paginated${upperFirst(camelCase(pluralClassName))} = sorted${upperFirst(camelCase(pluralClassName))}.slice(skip, skip + size);

    // Convert to List${className}Props format
        const items = await Promise.all(
      paginated${upperFirst(camelCase(pluralClassName))}.map(
        async (${camelCase(className)}) =>
          await this.hydrateStored${className}(user, ${camelCase(className)}, logContext),
      ),
    );

    // Create proper IListMeta
    const meta = {
      page,
      size,
      itemCount: sorted${upperFirst(camelCase(pluralClassName))}.length,
      pageCount: Math.ceil(sorted${upperFirst(camelCase(pluralClassName))}.length / size),
      hasPreviousPage: page > 1,
      hasNextPage: page < Math.ceil(sorted${upperFirst(camelCase(pluralClassName))}.length / size),
    };

    const ${camelCase(className)}Page = new ${className}Page(items, meta);

    this.logger.debug(
      logContext,
      \`Successfully listed \${items.length}/\${sorted${upperFirst(camelCase(pluralClassName))}.length} ${camelCase(pluralClassName)} from projection (page \${page}/\${meta.pageCount})\`,
    );

    return ${camelCase(className)}Page;
  }

`);

  return lines;
}

function esdbRepositorySave(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects } = getTableProperties(
    schema,
    table,
  );

  lines.push(` // ✅ REQUIRED ABSTRACT METHOD: Implement save method from SagaCommandRepository
  protected async save(
    user: IUserToken,
    data: ${className},
    sagaContext?: ISagaContext,
  ): Promise<I${className}> {
    if (!user) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.userRequiredForOperation,
      );
    }
    if (!data || !data.${camelCase(primaryCol.name)}) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.fieldCodeRequired,
      );
    }

    const tenant = user.tenant;
    const ${camelCase(className)}Code = data.getId(); // Convert ${className}Identifier to string
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'save',
      ${camelCase(className)}Code${primaryCol.type === 'string' ? '' : '.toString()'},
      user,
    );

    // Add saga context to logging
    if (sagaContext) {
      Object.assign(logContext, {
        sagaId: sagaContext.sagaId,
        correlationId: sagaContext.correlationId,
        operationId: sagaContext.operationId,
        isRetry: sagaContext.isRetry || false,
      });
    }

    this.logger.debug(logContext, \`Saving ${camelCase(className)}: \${${camelCase(className)}Code}\`);

    try {
      // ✅ EVENT SOURCING: Use proper tenant-specific stream naming with new DDD convention
      const streamName = this.buildStreamName(tenant || '', ${camelCase(className)}Code);

      // ✅ SAGA-FRIENDLY: Check for idempotency using saga context
      if (sagaContext) {
        const existingEvent = await this.checkSagaOperationExists(
          streamName,
          ${camelCase(className)}Code,
          sagaContext.operationId,
        );

        if (existingEvent) {
          this.logger.debug(
            logContext,
            \`Saga operation already completed for ${camelCase(className)}: \${${camelCase(className)}Code}\`,
          );
          // Return existing result instead of duplicate operation
          const existing = await this.get(user, ${camelCase(className)}Code);
          if (existing) {
            return existing;
          }
        }
      }

      // ✅ EVENT SOURCING: Get uncommitted events from aggregate (proper pattern)
      const uncommittedEvents = data.getUncommittedEvents();

      if (!uncommittedEvents || uncommittedEvents.length === 0) {
        this.logger.debug(
          logContext,
          \`No uncommitted events for ${camelCase(className)}: \${${camelCase(className)}Code}, returning current state\`,
        );
        return data.toDto();
      }

      // ✅ SAGA-FRIENDLY: Add saga metadata to events if needed
      if (sagaContext) {
        uncommittedEvents.forEach((event) => {
          // Add saga metadata for EventStore serialization
          Object.assign(event, {
            _sagaMetadata: {
              sagaId: sagaContext.sagaId,
              correlationId: sagaContext.correlationId,
              operationId: sagaContext.operationId,
              timestamp: new Date().toISOString(),
              isCompensation: false,
            },
          });
        });
      }

      // ✅ EVENT SOURCING: Append the domain events to stream
   // Type-safe conversion: IEvent[] from NestJS CQRS to DomainEvent[] for EventStore
      const domainEvents = uncommittedEvents.filter(
        (event): event is DomainEvent => event instanceof DomainEvent,
      );

      if (domainEvents.length !== uncommittedEvents.length) {
        this.logger.warn(
          logContext,
          \`Some events are not DomainEvents: expected \${uncommittedEvents.length}, got \${domainEvents.length}\`,
        );
      }

      // ✅ DECLARATIVE: Pass stream metadata from Repository constants
      const streamMetadata = {
        context: ${className}ProjectionKeys.ESDB_BOUNDED_CONTEXT,
        aggregateType: ${className}ProjectionKeys.ESDB_AGGREGATE_NAME,
        version: ${className}ProjectionKeys.ESDB_VERSION,
        service: ${className}Repository.SERVICE_NAME,
        correlationId: sagaContext?.correlationId,
        causationId: sagaContext?.operationId, // Using operationId as causationId
      };

      await this.eventOrchestration.appendDomainEventsToStream(
        streamName,
        domainEvents,
        streamMetadata, // ✅ Pass declarative metadata from Repository
      );

      // ✅ EVENT SOURCING: Mark events as committed
      data.commit();

      this.logger.debug(
        logContext,
        \`Successfully saved ${camelCase(className)}: \${${camelCase(className)}Code} with \${uncommittedEvents.length} events\`,
      );



      // ✅ SAGA-FRIENDLY: Return aggregate data directly instead of querying
      // This avoids read-after-write consistency issues in sagas
      return data.toDto();

    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          tenant,
          ${camelCase(className)}Code,
          username: user?.preferred_username,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to save ${camelCase(className)}',
      );

      if (error instanceof ${className}DomainException) {
        throw error;
      }

      throw new ${className}DomainException(${className}ExceptionMessage.updateError);
    }
  }

  // Helper method to rebuild ${camelCase(className)} from events
  private rebuild${className}FromEvents(
    events: DomainEvent[],
    snapshot?: Snapshot${className}Props,
  ): Snapshot${className}Props {
    if (snapshot) {
      return snapshot;
    } else {
      // Type-safe event processing - look for ${className}CreatedEvent
      throw new Error('No ${camelCase(className)} creation event found in stream');
    }
  }

  // ✅ REQUIRED ABSTRACT METHOD: Implement compensate method from SagaCommandRepository
  protected async compensate(
    user: IUserToken,
    identifier: string | number,
    sagaContext: ISagaContext,
  ): Promise<void> {
    const ${camelCase(className)}Code = identifier.toString();
    await this.compensateSave(user, ${camelCase(className)}Code, sagaContext);
  }

  // ✅ REQUIRED ABSTRACT METHOD: Implement checkSagaOperationExists from SagaCommandRepository
  protected checkSagaOperationExists(
    streamName: string,
    key: string,
    operationId: string,
  ): Promise<boolean> {
    try {
      // This would check the event stream for events with the same operationId
      // Implementation depends on your EventStore capabilities
      // For now, returning false to allow the operation
      return Promise.resolve(false);
    } catch (error) {
      this.logger.warn(
        { streamName, key, operationId, error },
        'Failed to check saga operation existence',
      );
      return Promise.resolve(false);
    }
  }

  // ✅ SAGA-FRIENDLY: Method for saga compensation (rollback)
  async compensateSave(
    user: IUserToken,
    ${camelCase(className)}Code: string,
    sagaContext: ISagaContext,
  ): Promise<void> {
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'compensateSave',
      ${camelCase(className)}Code,
      user,
    );

    Object.assign(logContext, {
      sagaId: sagaContext.sagaId,
      correlationId: sagaContext.correlationId,
      operationId: sagaContext.operationId,
    });

    this.logger.debug(
      logContext,
      \`Compensating save operation for ${camelCase(className)}: \${${camelCase(className)}Code}\`,
    );

    try {
      const streamName = this.buildStreamName(user.tenant || '', ${camelCase(className)}Code);

      // Create compensation event
      const compensationEvent = {
        ${camelCase(primaryCol.name)}: ${camelCase(className)}Code,
        eventType: '${className}UpdateCompensated',
        _sagaMetadata: {
          sagaId: sagaContext.sagaId,
          correlationId: sagaContext.correlationId,
          operationId: sagaContext.operationId,
          originalOperationId: sagaContext.operationId,
          timestamp: new Date().toISOString(),
          isCompensation: true,
        },
      };

      // TODO: Implement with eventOrchestration.appendDomainEventsToStream
      // await this.eventOrchestration.appendDomainEventsToStream(streamName, [compensationEvent]);
      throw new Error('compensateSave not yet implemented with new services');

      this.logger.debug(
        logContext,
        \`Successfully compensated save operation for ${camelCase(className)}: \${${camelCase(className)}Code}\`,
      );
    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          ${camelCase(className)}Code,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to compensate save operation',
      );
      throw error;
    }
  }

  async save${className}(
    user: IUserToken,
    data: ${className},
    sagaContext?: ISagaContext,
  ): Promise<I${className}> {
    return await this.save(user, data, sagaContext);
  }
`);

  return lines;
}

function esdbRepositoryDelete(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const { className, primaryCol } = getTableProperties(schema, table);
  const lines = [];

  lines.push(`  async delete(
    user: IUserToken,
    identifier: ${primaryCol.type},
  ): Promise<void> {
    const startTime = Date.now();
    const code = identifier;
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'delete',
      code${primaryCol.type !== 'string' ? '.toString()' : ''},
      user,
    );

    this.logger.debug(
      logContext,
      \`Delete operation started for ${camelCase(className)}: \${code}\`,
    );

    try {
      // Use the new entity-level stream naming convention
      const streamName = this.buildStreamName(user.tenant || '', code${primaryCol.type !== 'string' ? '.toString()' : ''});

      // First, verify the ${camelCase(className)} exists and get the aggregate
      const aggregate = await this.get(user, code);
      if (!aggregate) {
        throw new ${className}DomainException(${className}ExceptionMessage.notFound);
      }

      // Create a delete event using the new stream
      // TODO: Implement proper domain event creation and append to stream
      // For now, throw a descriptive error with the stream name
      throw new Error(
        \`delete method not yet implemented with new services. Stream: \${streamName}\`,
      );

      // Planned implementation:
      // 1. Create ${className} aggregate from existing data
      // 2. Call markForDeletion() on the aggregate to generate delete event
      // 3. Use eventOrchestration.appendDomainEventsToStream(streamName, events)
      // 4. Commit the events

      const duration = Date.now() - startTime;
      this.logger.debug(
        {
          ...logContext,
          duration,
          ${camelCase(className)}Code: code,
        },
        \`Successfully deleted ${camelCase(className)}: \${code}\`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorContext = this.createErrorContext(
        logContext,
        error as Error,
        duration,
      );
      const errorMessage = this.extractErrorMessage(
        error,
        ${className}ExceptionMessage.deleteError,
      );

      this.logger.error(
        {
          ...errorContext,
          ${camelCase(className)}Code: code,
          username: user?.preferred_username,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        \`Failed to delete ${camelCase(className)}: \${code}\`,
      );

      this.handleError(
        error as Error,
        user,
        errorContext,
        errorMessage,
        duration,
      );
    }
  }
`);

  return lines;
}

module.exports = {
  esdbRepositoryGet,
  esdbRepositoryList,
  esdbRepositoryGetByCodes,
  esdbRepositorySave,
  esdbRepositoryDelete,
  generateRebuildFromEventsMethod,
  getStreamName,
};
