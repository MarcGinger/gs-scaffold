const path = require('path');
const { writeFileWithDir } = require('../../../utils/file-utils');
const {
  buildImportLines,
  isJoinTableValid,
} = require('../../../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  snakeCase,
  sentenceCase,
  singularize,
  pluralize,
} = require('../../../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../../../utils/general-utils');

const {
  getTableProperties,
  hasComplexHydration,
} = require('./repository-utils');

function ormRepositoryGet(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, fieldCols, complexObjects, specialCols } =
    getTableProperties(schema, table);

  // Helper function to add select clause
  const addSelect = () => {
    lines.push(`        select: {`);
    fieldCols.forEach((col) => {
      lines.push(`          ${camelCase(col.name)}: true,`);
    });
    lines.push(`        },`);
  };

  // Helper function to add relationships clause
  const addRelationships = () => {
    lines.push(
      `        relations: {\n          ${table.cols
        .filter((col) => col.datatype !== 'JSON')
        .map((col) => {
          const rel = col.relationship;
          if (!rel) {
            return;
          }
          if (col.type === 'Record<string, any>') {
            return;
          }
          if (
            isJoinTableValid(
              schema.parameters[rel.parentTable]?.store,
              schema.parameters[rel.childTable]?.store,
            )
          ) {
            return `${camelCase(rel.childCol)}: true`;
          }
        })
        .filter((i) => i)
        .join(',\n          ')}\n        },`,
    );
  };

  // Support multiple primary keys
  const primaryCols = table.cols
    .filter((col) => col.name !== 'tenant')
    .filter((col) => col.pk);

  lines.push(
    `  protected async get(user: IUserToken, ${primaryCols.map((col) => `${camelCase(col.name)}: ${col.type}`).join(', ')}): Promise<I${className}> {
    const tenantId = user.tenant;
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      COMPONENT_NAME,
      'get',
      ${camelCase(primaryCol.name)}${primaryCol.type === 'string' ? '' : `.toString()`},
      user,
    );
    this.logger.debug(logContext, \`Getting ${camelCase(className)} by ${primaryCols.map((col) => camelCase(col.name)).join(', ')}: \${${primaryCols.map((col) => camelCase(col.name)).join(', ')}}\`);

    try {
      const entity = await this.${camelCase(className)}Repository.findOneOrFail({
        where: { ${primaryCols.map((col) => camelCase(col.name)).join(', ')}, tenantId },`,
  );

  addSelect();
  addRelationships();

  lines.push(`      });

      // Use the helper method for hydration
      const ${camelCase(className)} = ${hasComplexHydration(complexObjects, specialCols) ? 'await ' : ''}this.hydrate${className}Entity(user, entity, logContext);

      this.logger.debug(logContext, \`Successfully retrieved ${camelCase(className)}: \${${primaryCols.map((col) => camelCase(col.name)).join(', ')}}\`);
      return ${camelCase(className)};

    } catch (e) {
      this.logger.error(
        {
          ...logContext,
          ${primaryCols.map((col) => `${camelCase(col.name)},`).join('\n          ')}
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

function ormRepositoryGetByCodes(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, fieldCols, complexObjects, specialCols } =
    getTableProperties(schema, table);
  const pluralClassName = pluralize(className);
  const pluralPrimaryCol = pluralize(primaryCol.name);

  // Helper function to add select clause
  const addSelect = () => {
    lines.push(`        select: {`);
    fieldCols.forEach((col) => {
      lines.push(`          ${camelCase(col.name)}: true,`);
    });
    lines.push(`        },`);
  };

  // Helper function to add relationships clause
  const addRelationships = () => {
    lines.push(
      `        relations: {\n          ${table.cols
        .filter((col) => col.datatype !== 'JSON')
        .map((col) => {
          const rel = col.relationship;
          if (!rel) {
            return;
          }
          if (col.type === 'Record<string, any>') {
            return;
          }
          if (
            isJoinTableValid(
              schema.parameters[rel.parentTable]?.store,
              schema.parameters[rel.childTable]?.store,
            )
          ) {
            return `${camelCase(rel.childCol)}: true`;
          }
        })
        .filter((i) => i)
        .join(',\n          ')}\n        },`,
    );
  };

  lines.push(`  async getByCodes(user: IUserToken, ${camelCase(pluralPrimaryCol)}: ${primaryCol.type}[]): Promise<I${className}[]> {
    if (!${camelCase(pluralPrimaryCol)} || ${camelCase(pluralPrimaryCol)}.length === 0) {
      return [];
    }

    const tenantId = user.tenant;
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(COMPONENT_NAME, 'getByCodes', ${camelCase(pluralPrimaryCol)}.join(','), user);

    this.logger.debug(logContext, \`Getting ${camelCase(pluralClassName)} by codes: \${${camelCase(pluralPrimaryCol)}.join(', ')}\`);

    try {
      const entities = await this.${camelCase(className)}Repository.find({
        where: {
          ${camelCase(primaryCol.name)}: In(${camelCase(pluralPrimaryCol)}),
          tenantId,
        },`);

  addSelect();
  addRelationships();

  lines.push(`      });

      if (entities.length === 0) {
        this.logger.warn(
          logContext,
          \`No ${camelCase(pluralClassName)} found for ${camelCase(pluralPrimaryCol)}: \${${camelCase(pluralPrimaryCol)}.join(', ')}\`,
        );
        return [];
      }

      // Use the helper method for hydration
      const ${camelCase(pluralClassName)} = ${hasComplexHydration(complexObjects, specialCols) ? 'await Promise.all(' : ''}
        entities.map((entity) =>
          this.hydrate${className}Entity(user, entity, logContext),
        )${hasComplexHydration(complexObjects, specialCols) ? ')' : ''};

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

function ormRepositoryList(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const {
    className,
    primaryCol,
    fieldCols,
    complexObjects,
    specialCols,
    idxCols,
  } = getTableProperties(schema, table);
  const pluralClassName = pluralize(className);

  // Helper function to add select clause
  const addSelect = () => {
    lines.push(`        select: {`);
    fieldCols.forEach((col) => {
      lines.push(`          ${camelCase(col.name)}: true,`);
    });
    lines.push(`        },`);
  };

  // Helper function to add relationships clause
  const addRelationships = () => {
    lines.push(
      `        relations: {\n          ${table.cols
        .filter((col) => col.datatype !== 'JSON')
        .map((col) => {
          const rel = col.relationship;
          if (!rel) {
            return;
          }
          if (col.type === 'Record<string, any>') {
            return;
          }
          if (
            isJoinTableValid(
              schema.parameters[rel.parentTable]?.store,
              schema.parameters[rel.childTable]?.store,
            )
          ) {
            return `${camelCase(rel.childCol)}: true`;
          }
        })
        .filter((i) => i)
        .join(',\n          ')}\n        },`,
    );
  };

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
      if (!options.page) {
        options.page = 1;
      }
      if (!options.size) {
        options.size = 250;
      }

      // Build order clause
      const order: FindOptionsOrder<${className}Entity> = {};
      if (
        options.orderBy &&
        Object.values(List${className}OrderEnum).includes(options.orderBy)
      ) {
        order[options.orderBy] =
          options.order?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      } else {
        // Default ordering
        order['${camelCase(idxCols[0].name)}'] = 'ASC';
      }

      // Build where clause
      const where: FindOptionsWhere<${className}Entity> = {};
      where.tenantId = tenantId;

      ${idxCols
        .map(
          (col) => `
      if (options.${camelCase(col.name)}) {
        ${
          col.idx && col.idx.fulltext && col.type === 'string'
            ? `where.${camelCase(col.name)} = ILike(\`%\${options.${camelCase(col.name)}}%\`);`
            : `where.${camelCase(col.name)} = options.${camelCase(col.name)};`
        }
      }`,
        )
        .join('')}

      const [entities, count] = await this.${camelCase(className)}Repository.findAndCount({
        order,
        skip: (options.page - 1) * options.size,
        take: options.size,
        where,`);

  addSelect();
  addRelationships();

  lines.push(`      });

      if (entities.length === 0) {
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
      const ${camelCase(pluralClassName)} = ${hasComplexHydration(complexObjects, specialCols) ? 'await Promise.all(' : ''}
        entities.map((entity) =>
          this.hydrate${className}Entity(user, entity, logContext),
        )${hasComplexHydration(complexObjects, specialCols) ? ')' : ''};

      const totalPages = Math.ceil(count / options.size);
      const result = {
        data: ${camelCase(pluralClassName)},
        meta: {
          page: options.page,
          size: options.size,
          itemCount: ${camelCase(pluralClassName)}.length,
          pageCount: totalPages,
          hasPreviousPage: options.page > 1,
          hasNextPage: options.page < totalPages,
        },
      };

      this.logger.debug(
        logContext,
        \`Successfully retrieved \${${camelCase(pluralClassName)}.length} ${camelCase(pluralClassName)} (page \${options.page} of \${totalPages})\`,
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

function ormRepositorySave(schema, table) {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const lines = [];
  const { className, primaryCol, complexObjects, specialCols } =
    getTableProperties(schema, table);

  lines.push(
    `  // This is the implementation that overrides the abstract method in the base class
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
      const entity = new ${className}Entity();
      entity.tenantId = tenantId!; // Assert non-null since we validated user`,
  );

  // Generate entity property mappings
  table.cols.forEach((col) => {
    const relationship = table._relationships.find(
      (r) => r.childCol === col.name && col.datatype !== 'JSON',
    );
    if (relationship) {
      const complexItem = complexObjects.find(
        (item) => item.col.name === col.name,
      );
      if (complexItem) {
        lines.push(
          `      entity.${camelCase(col.name)} = ${complexItem.type}.${camelCase(col.name)};`,
        );
      } else {
        if (
          schema.parameters?.[relationship.parentTable]?.store?.read !== 'sql'
        ) {
          if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
            lines.push(
              `      entity.${camelCase(col.name)} = ${camelCase(className)}Dto.${camelCase(col.name)}.map((item) => item.${camelCase(relationship.parentCol)});`,
            );
          } else {
            lines.push(
              `      entity.${camelCase(col.name)} = ${camelCase(className)}Dto.${camelCase(col.name)}.${camelCase(relationship.parentCol)};`,
            );
          }
        }
      }
    } else {
      if (col.datatype !== 'JSON' || col.type === 'Record<string, any>') {
        lines.push(
          `      entity.${camelCase(col.name)} = ${camelCase(className)}Dto.${camelCase(col.name)};`,
        );
      }
    }
  });

  // Handle many-to-many relationships
  table.cols.forEach((col) => {
    const relationship = table._relationships.find(
      (r) => r.childCol === col.name && col.datatype !== 'JSON',
    );
    if (relationship) {
      if (
        schema.parameters?.[relationship.parentTable]?.store?.read === 'sql'
      ) {
        if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
          lines.push(
            `
      // Handle ${camelCase(col.name)} (many-to-many relationship)
      if (${camelCase(className)}Dto.${camelCase(col.name)} && ${camelCase(className)}Dto.${camelCase(col.name)}.length > 0) {
        const codes = ${camelCase(className)}Dto.${camelCase(col.name)}.map((item) => item.${camelCase(relationship.parentCol)});
        entity.${camelCase(col.name)} = await this.get${upperFirst(camelCase(pluralize(relationship.parentTable)))}(user, codes);
      } else {
        entity.${camelCase(col.name)} = [];
      }`,
          );
        }
      }
    }
  });

  // Handle JSON columns
  table.cols.forEach((col) => {
    const relationship = table._relationships.find(
      (r) => r.childCol === col.name && col.datatype === 'JSON',
    );
    if (relationship) {
      lines.push(
        `      entity.${camelCase(col.name)} = this.convert${upperFirst(camelCase(relationship.parentTable))}ToSnapshot(${camelCase(className)}Dto.${camelCase(col.name)});`,
      );
    }
  });

  lines.push(`
      // Save the entity
      const savedEntity = await this.${camelCase(className)}Repository.save(entity);

      this.logger.debug(
        logContext,
        \`Successfully saved ${camelCase(className)}: \${${camelCase(className)}Code}\`,
      );

      // Convert back to I${className} format and return
      return await this.get(user, savedEntity.${camelCase(primaryCol.name)});

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

function ormRepositoryDelete(schema, table) {
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

      // Check if ${camelCase(className)} exists in database before attempting deletion
      const entity = await this.${camelCase(className)}Repository.findOne({
        where: { ${camelCase(primaryCol.name) === 'code' ? 'code' : `${camelCase(primaryCol.name)}: code`}, tenantId: user.tenant },
      });

      if (!entity) {
        this.logger.warn(logContext, \`${className} \${code} not found in database\`);
        throw new ${className}DomainException(${className}ExceptionMessage.notFound);
      }

      // Delete the ${camelCase(className)} from database
      await this.${camelCase(className)}Repository.remove(entity);

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
  ormRepositoryGet,
  ormRepositoryList,
  ormRepositoryGetByCodes,
  ormRepositorySave,
  ormRepositoryDelete,
};
