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

// Helper function to generate Redis key constant
const getRedisKey = (schema, table, className) =>
  `REDIS_${snakeCase(className).toUpperCase()}_KEY`;

function redisRepositoryGet(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects, specialCols } =
    getTableProperties(schema, table);

  lines.push(`  protected async get(user: IUserToken, ${camelCase(primaryCol.name)}: ${primaryCol.type}): Promise<I${className}> {
    const tenantId = user.tenant;
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'get',
      ${camelCase(primaryCol.name)}${primaryCol.type === 'string' ? '' : `.toString()`},
      user,
    );

    this.logger.debug(logContext, \`Getting ${camelCase(className)} by ${camelCase(primaryCol.name)}: \${${camelCase(primaryCol.name)}}\`);

    try {
      // Get ${camelCase(className)} from Redis
      const stored${className} = await this.redisUtilityService.getOne<Snapshot${className}Props>(
        user,
        this.${getRedisKey(schema, table, className)},
        ${camelCase(primaryCol.name)}${primaryCol.type === 'string' ? '' : `.toString()`},
      );

      if (!stored${className}) {
        throw new ${className}DomainException(${className}ExceptionMessage.notFound);
      }

      // Use the helper method for hydration
      const ${camelCase(className)} = ${hasComplexHydration(complexObjects, specialCols) ? 'await ' : ''}this.hydrateStored${className}(user, stored${className}, logContext);

      this.logger.debug(logContext, \`Successfully retrieved ${camelCase(className)}: \${${camelCase(primaryCol.name)}}\`);
      return ${camelCase(className)};

    } catch (e) {
      this.logger.error(
        {
          ...logContext,
          ${camelCase(primaryCol.name)},
          tenantId,
          username: user?.preferred_username,
          error: e instanceof Error ? e.message : 'Unknown error',
        },
        '${className} get error',
      );

      if (e instanceof ${className}DomainException) {
        throw e;
      }

      throw new ${className}DomainException(${className}ExceptionMessage.notFound);
    }
  }
`);

  return lines;
}

function redisRepositoryGetByCodes(schema, table) {
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

    const tenantId = user.tenant;
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(COMPONENT_NAME, 'getByCodes', ${camelCase(pluralPrimaryCol)}.join(','), user);

    this.logger.debug(logContext, \`Getting ${camelCase(pluralClassName)} by codes: \${${camelCase(pluralPrimaryCol)}.join(', ')}\`);

    try {
      // Get ${camelCase(pluralClassName)} from Redis by codes
      const stored${upperFirst(camelCase(pluralClassName))} = await this.redisUtilityService.getMany<Snapshot${className}Props>(
        user,
        this.${getRedisKey(schema, table, className)},
        ${camelCase(pluralPrimaryCol)}${primaryCol.type === 'string' ? '' : `.map((code) => code.toString())`},
      );

      if (stored${upperFirst(camelCase(pluralClassName))}.length === 0) {
        this.logger.warn(
          logContext,
          \`No ${camelCase(pluralClassName)} found for ${camelCase(pluralPrimaryCol)}: \${${camelCase(pluralPrimaryCol)}.join(', ')}\`,
        );
        return [];
      }

      // Use the helper method for hydration
      const ${camelCase(pluralClassName)} = await Promise.all(
        stored${upperFirst(camelCase(pluralClassName))}.map(
          async (item) => await this.hydrateStored${className}(user, item, logContext),
        ),
      );

      this.logger.debug(
        logContext,
        \`Successfully retrieved \${${camelCase(pluralClassName)}.length} ${camelCase(pluralClassName)}\`,
      );
      return ${camelCase(pluralClassName)};

    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          ${camelCase(pluralPrimaryCol)},
          tenantId,
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

function redisRepositoryList(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects, specialCols, idxCols } =
    getTableProperties(schema, table);
  const pluralClassName = pluralize(className);

  lines.push(`  async list(
    user: IUserToken,
    pageOptions: List${className}PropsOptions = {},
  ): Promise<${className}Page> {
    const tenantId = user.tenant;
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
      const options: List${className}PropsOptions = pageOptions || {};
      if (!options.page) options.page = 1;
      if (!options.size) options.size = 250;

      // Get all ${camelCase(pluralClassName)} from Redis
      const all${upperFirst(camelCase(pluralClassName))} = await this.redisUtilityService.getAllValues<Snapshot${className}Props>(
        user,
        this.${getRedisKey(schema, table, className)},
      );
      // Filter ${camelCase(pluralClassName)} based on search criteria
      let filtered${upperFirst(camelCase(pluralClassName))} = all${upperFirst(camelCase(pluralClassName))};
`);

  idxCols.forEach((col) => {
    lines.push(`      if (options.${camelCase(col.name)}) {`);
    lines.push(`        const ${camelCase(col.name)}Filter = options.${camelCase(col.name)}${col.type === 'string' ? '.toLowerCase()' : '.toString()'};
        filtered${upperFirst(camelCase(pluralClassName))} = filtered${upperFirst(camelCase(pluralClassName))}.filter((${camelCase(className)}) =>
          ${camelCase(className)}.${camelCase(col.name)}${col.type === 'string' ? '.toLowerCase()' : '.toString()'}.includes(${camelCase(col.name)}Filter),
        );
      }`);
  });

  lines.push(`
      // Sort ${camelCase(pluralClassName)}
      if (options.orderBy && Object.values(List${className}OrderEnum).includes(options.orderBy)) {
        filtered${upperFirst(camelCase(pluralClassName))}.sort((a, b) => {
          const aValue = a[options.orderBy!];
          const bValue = b[options.orderBy!];
          const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          return options.order?.toLowerCase() === 'desc' ? -result : result;
        });
      } else {
        // Default ordering by code
        filtered${upperFirst(camelCase(pluralClassName))}.sort((a, b) => a.${camelCase(primaryCol.name)}${primaryCol.type === 'string' ? '' : '.toString()'}.localeCompare(b.${camelCase(primaryCol.name)}${primaryCol.type === 'string' ? '' : '.toString()'}));
      }

      // Paginate
      const startIndex = (options.page - 1) * options.size;
      const endIndex = startIndex + options.size;
      const paginated${upperFirst(camelCase(pluralClassName))} = filtered${upperFirst(camelCase(pluralClassName))}.slice(startIndex, endIndex);

      if (paginated${upperFirst(camelCase(pluralClassName))}.length === 0) {
        this.logger.debug(
          logContext,
          \`No ${camelCase(pluralClassName)} found for page \${options.page}\`,
        );
        return {
          data: [],
          meta: {
            page: options.page,
            size: options.size,
            itemCount: 0,
            pageCount: 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        };
      }

      // Hydrate each entity to domain objects using the helper method
      const hydrated${upperFirst(camelCase(pluralClassName))} = await Promise.all(
        paginated${upperFirst(camelCase(pluralClassName))}.map((${camelCase(className)}) =>
          this.hydrateStored${className}(user, ${camelCase(className)}, logContext),
        ),
      );

      const totalPages = Math.ceil(filtered${upperFirst(camelCase(pluralClassName))}.length / options.size);
      const result = {
        data: hydrated${upperFirst(camelCase(pluralClassName))},
        meta: {
          page: options.page,
          size: options.size,
          itemCount: hydrated${upperFirst(camelCase(pluralClassName))}.length,
          pageCount: totalPages,
          hasPreviousPage: options.page > 1,
          hasNextPage: options.page < totalPages,
        },
      };

      this.logger.debug(
        logContext,
        \`Successfully retrieved \${hydrated${upperFirst(camelCase(pluralClassName))}.length} ${camelCase(pluralClassName)} (page \${options.page} of \${totalPages})\`,
      );
      return result;

    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          pageOptions,
          tenantId,
          username: user?.preferred_username,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to list ${pluralClassName}',
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

function redisRepositorySave(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects } = getTableProperties(
    schema,
    table,
  );

  lines.push(`  // This is the implementation that overrides the abstract method in the base class
  // to handle the specific I${className} to I${className}Stream conversion
  protected async save(
    user: IUserToken,
    data: ${className},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    const tenantId = user.tenant;
    const ${camelCase(className)}Code = data.${camelCase(primaryCol.name)}.value; // Convert ${className}Identifier to string
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'save',
      ${camelCase(className)}Code${primaryCol.type === 'string' ? '' : '.toString()'},
      user,
    );

    this.logger.debug(logContext, \`Saving ${camelCase(className)}: \${${camelCase(className)}Code}\`);

    try {
      // Convert the ${className} aggregate to DTO first
      const ${camelCase(className)}Dto = data.toDto();

      // Convert the domain objects to entity format
      const ${camelCase(className)}: Snapshot${className}Props = {`);

  // Generate column mappings in a more readable way
  table.cols.forEach((col) => {
    const relationship = table._relationships.find(
      (r) => r.childCol === col.name,
    );
    if (relationship) {
      const complexItem = complexObjects.find(
        (item) => item.col.name === col.name,
      );
      if (col.datatype === 'JSON') {
        lines.push(
          `        ${camelCase(col.name)}: this.convert${upperFirst(camelCase(relationship.parentTable))}ToSnapshot(${camelCase(className)}Dto.${camelCase(col.name)}),`,
        );
      } else {
        if (complexItem) {
          lines.push(
            `        ${camelCase(col.name)}: ${complexItem.type}.${camelCase(col.name)},`,
          );
        } else {
          if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
            lines.push(
              `        ${camelCase(col.name)}: ${camelCase(className)}Dto.${camelCase(col.name)}.map((item) => item.${camelCase(relationship.parentCol)}),`,
            );
          } else {
            lines.push(
              `        ${camelCase(col.name)}: ${camelCase(className)}Dto.${camelCase(col.name)}.${camelCase(relationship.parentCol)},`,
            );
          }
        }
      }
    } else {
      if (col.datatype !== 'JSON' || col.type === 'Record<string, any>') {
        lines.push(
          `        ${camelCase(col.name)}: ${camelCase(className)}Dto.${camelCase(col.name)},`,
        );
      }
    }
  });

  lines.push(`      };

      // Store the ${camelCase(className)} in Redis
      await this.redisUtilityService.write(
        user,
        this.${getRedisKey(schema, table, className)},
        ${camelCase(className)}Code${primaryCol.type === 'string' ? '' : '.toString()'},
        ${camelCase(className)},
      );

      this.logger.debug(
        logContext,
        \`Successfully saved ${camelCase(className)}: \${${camelCase(className)}Code}\`,
      );

      // Return the saved ${camelCase(className)}
      return await this.get(user, ${camelCase(className)}Code);
    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          tenantId,
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
`);
  // Generate public save method
  lines.push(
    `  async save${className}(user: IUserToken, data: ${className}): Promise<I${className}> {`,
  );

  lines.push('    return await this.save(user, data);');

  lines.push('  }', '');
  return lines;
}

function redisRepositoryDelete(schema, table) {
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
      // First, verify the ${camelCase(className)} exists and get the aggregate
      const aggregate = await this.getById(user, code);
      this.validateEntityExists(aggregate, ${className}ExceptionMessage.notFound);

      // Mark for deletion in the domain (for domain events)
      aggregate.markForDeletion(user);

      // Check if ${camelCase(className)} exists in Redis before attempting deletion
      const exists = await this.redisUtilityService.exists(
        user,
        this.${getRedisKey(schema, table, className)},
        code${primaryCol.type === 'string' ? '' : '.toString()'},
      );

      if (!exists) {
        this.logger.warn(
          logContext,
          \`${className} \${code} not found in Redis storage\`,
        );
        throw new ${className}DomainException(${className}ExceptionMessage.notFound);
      }

      // Delete the ${camelCase(className)} from Redis
      await this.redisUtilityService.delete(user, this.${getRedisKey(schema, table, className)}, code${primaryCol.type === 'string' ? '' : '.toString()'});

      const duration = Date.now() - startTime;
      this.logger.debug(
        {
          ...logContext,
          duration,
          ${camelCase(className)}Code: code,
        },
        \`Successfully deleted ${camelCase(className)}: \${code}\`,
      );

      // Emit delete event
      const deleteEvent = this.getDeleteEvent(user, aggregate);
      if (deleteEvent) {
        // Note: Event publishing would typically be handled by the application layer
        this.logger.debug(
          logContext,
          \`Delete event created for ${camelCase(className)}: \${code}\`,
        );
      }
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
  redisRepositoryGet,
  redisRepositoryList,
  redisRepositoryGetByCodes,
  redisRepositorySave,
  redisRepositoryDelete,
};
