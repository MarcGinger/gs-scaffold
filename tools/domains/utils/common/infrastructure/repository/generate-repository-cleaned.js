const path = require('path');
const {
  upperFirst,
  camelCase,
  kebabCase,
  pluralize,
  singularize,
  sentenceCase,
  snakeCase,
} = require('../../../utils/word-utils');
const {
  addImport,
  getUniqueRelationships,
} = require('../../../utils/general-utils');
const {
  isJoinTableValid,
  buildImportLines,
} = require('../../../utils/generator-utils');
const {
  getComplexObjects,
  getComplexRelationships,
} = require('../../utils/model-utils');
const { getTableProperties } = require('./repository-utils');

// Import repository method generators
const {
  noopRepositoryGet,
  noopRepositoryList,
  noopRepositoryGetByCodes,
  noopRepositorySave,
  noopRepositoryDelete,
} = require('./noop-repository');

const {
  redisRepositoryGet,
  redisRepositoryList,
  redisRepositoryGetByCodes,
  redisRepositorySave,
  redisRepositoryDelete,
} = require('./redis-repository');
const {
  ormRepositoryGet,
  ormRepositoryList,
  ormRepositoryGetByCodes,
  ormRepositorySave,
  ormRepositoryDelete,
} = require('./orm-repository');

const {
  esdbRepositoryGet,
  esdbRepositoryList,
  esdbRepositoryGetByCodes,
  esdbRepositorySave,
  esdbRepositoryDelete,
} = require('./esdb-repository');

const {
  mongoRepositoryGet,
  mongoRepositoryList,
  mongoRepositoryGetByCodes,
  mongoRepositorySave,
  mongoRepositoryDelete,
} = require('./mongo-repository');

const {
  repositoryHydrateComplexObjects,
  ormRepositoryHydrateComplexObjects,
} = require('./hydrate-complex-objects');

function getProjectionType(schema, table) {
  if (schema.parameters?.[table.name]?.store?.write === 'eventstream') {
    switch (schema.parameters?.[table.name]?.store?.list) {
      case 'redis':
        return 'redis';
      case 'mongo':
        return 'mongo';
      case 'sql':
        return 'sql';
      default:
        return 'memory';
    }
  }
  return '';
}

/**
 * Helper function to get storage type for a table
 * @param {Object} schema - Database schema
 * @param {string} tableName - Table name
 * @returns {string} Storage type (sql, redis, eventstream, mongo, or default)
 */
const getStorageType = (schema, tableName) => {
  return schema.parameters?.[tableName]?.store?.read || 'default';
};

/**
 * Helper function to check if table has specific operation enabled
 * @param {Object} schema - Database schema
 * @param {string} tableName - Table name
 * @param {string} operation - Operation name (create, update, delete, get, batch)
 * @returns {boolean}
 */
const isOperationEnabled = (schema, tableName, operation) => {
  return !schema.parameters?.[tableName]?.cancel?.[operation];
};

/**
 * Helper function to set up repository dependencies
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Array} uniqueRelationships - Unique relationships
 * @param {boolean} hasRedis - Has Redis storage
 * @param {boolean} hasEventStream - Has event stream
 * @param {boolean} hasSql - Has SQL storage
 * @param {boolean} hasMongo - Has MongoDB storage
 */
const setupRepositoryDependencies = (
  schema,
  table,
  imports,
  lines,
  uniqueRelationships,
  hasRedis,
  hasEventStream,
  hasSql,
  hasMongo,
) => {
  const { className } = getTableProperties(schema, table);

  // Set up SQL repository
  if (getStorageType(schema, table.name) === 'sql') {
    addImport(imports, '../entities', `${className}Entity`);
    addImport(imports, 'typeorm', `Repository`);
    lines.push(
      `  protected ${camelCase(table.name)}Repository: Repository<${className}Entity>;`,
    );
  }

  // Set up relationship repositories
  uniqueRelationships.forEach((relation) => {
    if (
      getStorageType(schema, relation.parentTable) === 'sql' &&
      getStorageType(schema, table.name) === 'sql'
    ) {
      addImport(
        imports,
        `../../../${kebabCase(relation.parentClass)}/infrastructure/entities`,
        `${upperFirst(camelCase(relation.parentClass))}Entity`,
      );
      lines.push(
        `  protected ${camelCase(relation.parentClass)}Repository: Repository<${upperFirst(camelCase(relation.parentClass))}Entity>;`,
      );
    }
  });

  // Set up MongoDB collection if needed
  if (hasMongo) {
    const mongoCollection =
      schema.parameters[table.name]?.mongo?.collection || camelCase(table.name);
    lines.push(
      `  private readonly MONGO_${className.toUpperCase()}_COLLECTION = '${mongoCollection}';`,
    );
    lines.push('');
  }
};

/**
 * Helper function to setup constructor dependencies
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Array} uniqueRelationships - Unique relationships
 * @param {Array} complexRelationships - Complex relationships
 * @param {boolean} hasRedis - Has Redis storage
 * @param {boolean} hasEventStream - Has event stream
 * @param {boolean} hasSql - Has SQL storage
 * @param {boolean} hasMongo - Has MongoDB storage
 */
const setupConstructorDependencies = (
  schema,
  table,
  imports,
  lines,
  uniqueRelationships,
  complexRelationships,
  hasRedis,
  hasEventStream,
  hasSql,
  hasMongo,
) => {
  const { className } = getTableProperties(schema, table);

  const projectorType = getProjectionType(schema, table);

  let hasProjector = projectorType ? true : false;
  const projector = `${className}${upperFirst(projectorType)}Projection`;

  lines.push('  constructor(');
  lines.push('    protected readonly configService: ConfigService,');
  lines.push("    @Inject('ILogger') protected readonly logger: ILogger,");

  if (hasEventStream) {
    lines.push(`    private readonly eventOrchestration: EventOrchestrationService,
    private readonly snapshotService: SnapshotService,
`);
  }

  if (hasProjector) {
    lines.push(`    @Inject('${projector}')
    private readonly ${camelCase(className)}Projection: ${projector},
`);
  }

  if (hasMongo) {
    lines.push(
      '    private readonly mongoUtilityService: MongoUtilityService,',
    );
  }

  if (hasSql) {
    addImport(imports, 'typeorm', ['DataSource']);
    lines.push('    protected readonly dataSource: DataSource,');
  }

  lines.push('');

  // Add relationship repositories
  uniqueRelationships.forEach((relation) => {
    if (
      !isJoinTableValid(
        schema.parameters[relation.parentTable]?.store,
        schema.parameters[relation.childTable]?.store,
      )
    ) {
      addImport(
        imports,
        `../../../${kebabCase(relation.parentClass)}/infrastructure/repositories`,
        `${upperFirst(camelCase(relation.parentClass))}Repository`,
      );
      lines.push(
        `    protected readonly ${camelCase(relation.parentClass)}Repository: ${upperFirst(camelCase(relation.parentClass))}Repository,`,
      );
    }
  });

  // Add complex relationship repositories
  complexRelationships.forEach((relation) => {
    addImport(
      imports,
      `../../../${kebabCase(relation.parentTable)}/domain/entities`,
      `I${upperFirst(camelCase(relation.parentTable))}`,
    );
    const col = table.cols.find((c) => c.name === relation.childCol);
    if (col?.defaultvalue === 'object()') {
    } else {
      addImport(
        imports,
        `../../../${kebabCase(relation.parentTable)}/infrastructure/repositories`,
        [`${upperFirst(camelCase(relation.parentTable))}Repository`],
      );
      lines.push(
        `    protected readonly ${camelCase(relation.parentTable)}Repository: ${upperFirst(camelCase(relation.parentTable))}Repository,`,
      );
    }
  });

  lines.push('  ) {');
};

/**
 * Helper function to generate method based on storage type
 * @param {string} storageType - Storage type (sql, redis, eventstream, mongo, or default)
 * @param {Object} methodGenerators - Object containing method generators for each storage type
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} defaultConfig - Default configuration for unsupported storage types
 * @returns {Array} Array of code lines
 */
const generateMethodByStorageType = (
  storageType,
  methodGenerators,
  schema,
  table,
  defaultConfig = {},
) => {
  const { className } = getTableProperties(schema, table);

  switch (storageType) {
    case 'sql':
      return methodGenerators.sql ? methodGenerators.sql(schema, table) : [];
    case 'redis':
      return methodGenerators.redis
        ? methodGenerators.redis(schema, table)
        : [];
    case 'eventstream':
      return methodGenerators.eventstream
        ? methodGenerators.eventstream(schema, table)
        : [];
    case 'mongo':
      return methodGenerators.mongo
        ? methodGenerators.mongo(schema, table)
        : [];
    default:
      return methodGenerators.default
        ? methodGenerators.default(schema, table, defaultConfig)
        : [];
  }
};

/**
 * Helper function to generate event methods for command repositories
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {boolean} hasCommand - Whether repository has command operations
 */
const generateEventMethods = (schema, table, imports, lines, hasCommand) => {
  if (!hasCommand) return;

  const { className } = getTableProperties(schema, table);
  const operations = ['create', 'update', 'delete'];

  operations.forEach((operation) => {
    const eventName = `${className}${upperFirst(operation)}dEvent`;
    const methodName = `get${upperFirst(operation)}Event`;

    if (isOperationEnabled(schema, table.name, operation)) {
      addImport(imports, '../../domain/events', eventName);
      lines.push(
        `  protected ${methodName}(user: IUserToken, aggregate: ${className}): IEvent {`,
      );
      lines.push(
        `    return new ${eventName}(user, aggregate.getId(), aggregate.toDto());`,
      );
      lines.push('  }');
    } else {
      lines.push(
        '  // eslint-disable-next-line @typescript-eslint/no-unused-vars',
      );
      lines.push(
        `  protected ${methodName}(user: IUserToken, aggregate: ${className}): IEvent {`,
      );
      lines.push(
        `    throw new ${className}DomainException(${className}ExceptionMessage.notImplemented);`,
      );
      lines.push('  }');
    }
    lines.push('');
  });
};

/**
 * Helper function to generate relationship methods
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Array} uniqueRelationships - Unique relationships
 * @param {Object} errors - Error tracking object
 */
const generateRelationshipMethods = (
  schema,
  table,
  imports,
  lines,
  uniqueRelationships,
  errors,
) => {
  const { className } = getTableProperties(schema, table);

  uniqueRelationships.forEach((relation) => {
    if (relation.c_p === 'many' && relation.c_ch === 'many') {
      // Generate many-to-many relationship methods
      generateManyToManyMethods(schema, table, imports, lines, relation);
    }

    // Generate single relationship method
    generateSingleRelationshipMethod(
      schema,
      table,
      imports,
      lines,
      relation,
      errors,
    );
  });
};

/**
 * Helper function to generate many-to-many relationship methods
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} relation - Relationship definition
 */
const generateManyToManyMethods = (schema, table, imports, lines, relation) => {
  const methodName = `get${upperFirst(camelCase(pluralize(relation.parentClass)))}`;
  const paramName = camelCase(pluralize(relation.parentCol));

  lines.push(`  /**`);
  lines.push(
    `   * Retrieves a list of ${sentenceCase(relation.parentClass)} based on the provided codes.`,
  );
  lines.push(
    `   * @param user - The user token containing authentication and authorization information.`,
  );
  lines.push(
    `   * @param codes - An array of ${sentenceCase(relation.parentClass)} ${camelCase(relation.parentCol)} to filter the results.`,
  );
  lines.push(
    `   * @returns A promise that resolves to an array of ${upperFirst(camelCase(relation.parentClass))} objects matching the specified codes.`,
  );
  lines.push(`   */`);

  if (
    isJoinTableValid(
      schema.parameters[relation.parentTable]?.store,
      schema.parameters[relation.childTable]?.store,
    )
  ) {
    addImport(imports, 'typeorm', 'In');
    lines.push(
      `  async ${methodName}(user: IUserToken, ${paramName}: ${relation.col.type}[]): Promise<${upperFirst(camelCase(relation.parentClass))}Entity[]> {`,
    );
    lines.push(
      `    return await this.${camelCase(relation.parentClass)}Repository.findBy({`,
    );
    lines.push(`      ${camelCase(relation.parentCol)}: In(${paramName}),`);
    lines.push(`    });`);
    lines.push('  }');
  } else {
    addImport(
      imports,
      `../../../${kebabCase(relation.parentClass)}/domain/entities`,
      `I${upperFirst(camelCase(relation.parentClass))}`,
    );
    lines.push(
      `  async ${methodName}(user: IUserToken, ${paramName}: ${relation.col.type}[]): Promise<I${upperFirst(camelCase(relation.parentClass))}[]> {`,
    );
    lines.push(
      `    return await this.${camelCase(singularize(relation.parentClass))}Repository.getByCodes(user, ${paramName});`,
    );
    lines.push('  }');
  }
  lines.push('');
};

/**
 * Helper function to generate single relationship method
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} relation - Relationship definition
 * @param {Object} errors - Error tracking object
 */
const generateSingleRelationshipMethod = (
  schema,
  table,
  imports,
  lines,
  relation,
  errors,
) => {
  const { className } = getTableProperties(schema, table);
  const methodName = `get${upperFirst(camelCase(relation.parentClass))}`;
  const paramName = camelCase(relation.parentCol);

  lines.push('  /**');
  lines.push(`   * Retrieves a ${camelCase(relation.parentClass)} by its code`);
  lines.push(
    `   * @param code ${upperFirst(camelCase(relation.parentClass))} code`,
  );
  lines.push(
    `   * @returns ${camelCase(relation.parentClass)} entity or null if not found`,
  );
  lines.push('   */');

  if (
    isJoinTableValid(
      schema.parameters[relation.parentTable]?.store,
      schema.parameters[relation.childTable]?.store,
    )
  ) {
    lines.push(
      `  async ${methodName}(user: IUserToken, ${paramName}: ${relation.col.type}): Promise<${upperFirst(camelCase(relation.parentClass))}Entity> {`,
    );
    lines.push(
      `    return this.${camelCase(relation.parent)}Repository.findOneOrFail({ where: { ${paramName} }, relations: [] });`,
    );
    lines.push('  }');
  } else {
    addImport(
      imports,
      `../../../${kebabCase(relation.parentClass)}/domain/entities`,
      `I${upperFirst(camelCase(relation.parentClass))}`,
    );
    lines.push(
      `  async ${methodName}(user: IUserToken, ${paramName}: ${relation.col.type}): Promise<I${relation.parentClass}> {`,
    );
    lines.push(
      `    const item = await this.${camelCase(relation.parentClass)}Repository.get${relation.parentClass}(user, ${paramName});`,
    );

    // Add error handling
    const errorKey = `${camelCase(relation.parentClass)}NotFound`;
    errors[table.name][errorKey] = {
      message: `${upperFirst(camelCase(relation.parentClass))} not found`,
      description: `The specified ${sentenceCase(relation.parentClass)} could not be found in the system`,
      code: `${snakeCase(relation.parentClass).toUpperCase()}_NOT_FOUND_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 404,
      domain: true,
    };

    lines.push('    if (!item) {');
    lines.push(
      `      throw new ${className}DomainException(${className}ExceptionMessage.${errorKey});`,
    );
    lines.push('    }');
    lines.push('    return item;');
    lines.push('  }');
  }
  lines.push('');
};

/**
 * Helper function to generate complex object methods
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Array} complexObjects - Complex objects array
 * @param {Object} errors - Error tracking object
 */
const generateComplexObjectMethods = (
  schema,
  table,
  imports,
  lines,
  complexObjects,
  errors,
) => {
  const { className } = getTableProperties(schema, table);

  if (complexObjects.length === 0) return;

  complexObjects
    .filter((complexObject) => complexObject.type === 'complex')
    .forEach((complexObject) => {
      // Generate main complex object method
      generateComplexObjectMethod(
        schema,
        table,
        imports,
        lines,
        complexObject,
        errors,
      );

      // Generate validation methods for each table in the complex object
      complexObject.tables.forEach((tableInfo) => {
        generateComplexObjectValidationMethod(
          schema,
          table,
          imports,
          lines,
          complexObject,
          tableInfo,
          errors,
        );
      });
    });
};

/**
 * Helper function to generate a single complex object method
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} complexObject - Complex object definition
 * @param {Object} errors - Error tracking object
 */
const generateComplexObjectMethod = (
  schema,
  table,
  imports,
  lines,
  complexObject,
  errors,
) => {
  const { className } = getTableProperties(schema, table);
  const entityName = upperFirst(singularize(complexObject.key));

  // Add JSDoc documentation
  lines.push('  /**');
  lines.push('   * Retrieves a complex object based on the provided data.');
  lines.push('   * @param user The user requesting the data.');
  lines.push(
    `   * @param ${complexObject.key} The ${complexObject.key} data to process.`,
  );
  lines.push(
    `   * @returns A promise that resolves to a complex ${complexObject.key} object.`,
  );
  lines.push('   */');

  // Add required imports
  addImport(
    imports,
    `../../../${kebabCase(singularize(complexObject.key))}/domain/entities`,
    `I${entityName}`,
  );

  addImport(
    imports,
    `../../../${kebabCase(singularize(complexObject.key))}/domain/properties`,
    [
      `Create${entityName}Props`,
      `Update${entityName}Props`,
      `Snapshot${entityName}Props`,
    ],
  );

  // Add imports for all related tables
  complexObject.tables.forEach((tableInfo) => {
    addImport(
      imports,
      `../../../${kebabCase(tableInfo.table_name)}/domain/entities`,
      `I${upperFirst(camelCase(tableInfo.table_name))}`,
    );
  });

  // Generate method signature

  lines.push(`  async ${complexObject.function}(`);
  lines.push('    user: IUserToken,');
  lines.push(
    `    ${complexObject.key}: Create${entityName}Props | Update${entityName}Props | Snapshot${entityName}Props,`,
  );
  lines.push(`  ): Promise<I${entityName}> {`);

  // Validate input parameter
  lines.push(`    if (!${complexObject.key}) {`);
  lines.push(
    `      throw new ${className}DomainException(${className}ExceptionMessage.${complexObject.key}NotFound);`,
  );
  lines.push('    }');
  lines.push('');

  // Generate try-catch block
  lines.push('    try {');
  lines.push(`      // Fetch all ${complexObject.key} components in parallel`);

  // Generate destructuring assignment for parallel validation calls
  const tableVariables = complexObject.tables
    .map((tableInfo) => camelCase(tableInfo.childCol.name))
    .join(', ');

  lines.push(`      const [${tableVariables}] = await Promise.all([`);

  // Generate validation calls for each table
  complexObject.tables.forEach((tableInfo) => {
    const validationCall =
      tableInfo.type === 'many'
        ? `this.validate${upperFirst(camelCase(tableInfo.childCol.name))}(user, ${complexObject.key}.${camelCase(tableInfo.childCol.name)} || [])`
        : `this.validate${upperFirst(camelCase(tableInfo.childCol.name))}(user, ${complexObject.key}.${camelCase(tableInfo.childCol.name)})`;

    lines.push(`        ${validationCall},`);
  });

  lines.push('      ]);');
  lines.push('');

  // Generate validation checks for non-array results
  complexObject.tables.forEach((tableInfo) => {
    if (tableInfo.type !== 'many') {
      const variableName = camelCase(tableInfo.childCol.name);
      lines.push(`      if (!${variableName}) {`);
      lines.push(
        `        throw new ${className}DomainException(${className}ExceptionMessage.${complexObject.key}NotFound);`,
      );
      lines.push('      }');
    }
  });

  lines.push('');

  // Generate return object construction
  lines.push('      // Construct the aggregate');
  lines.push('      return {');
  complexObject.tables.forEach((tableInfo) => {
    lines.push(`        ${camelCase(tableInfo.childCol.name)},`);
  });
  lines.push('      };');
  lines.push('');

  // Generate error handling
  lines.push('    } catch (error) {');
  lines.push('      this.logger.error(');
  lines.push('        {');
  lines.push('          component: COMPONENT_NAME,');
  lines.push(`          method: '${complexObject.function}',`);
  lines.push('          user: user.sub,');
  lines.push(`          ${camelCase(complexObject.key)},`);
  lines.push('        },');
  lines.push(
    `        'Failed to retrieve ${camelCase(complexObject.key)} configuration',`,
  );
  lines.push(
    "        error instanceof Error ? error.message : 'Unknown error',",
  );
  lines.push('      );');
  lines.push('      throw error;');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
};

/**
 * Helper function to generate validation method for complex object tables
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} complexObject - Complex object definition
 * @param {Object} tableInfo - Table information
 * @param {Object} errors - Error tracking object
 */
const generateComplexObjectValidationMethod = (
  schema,
  table,
  imports,
  lines,
  complexObject,
  tableInfo,
  errors,
) => {
  const { className } = getTableProperties(schema, table);
  const methodName = `validate${upperFirst(camelCase(tableInfo.childCol.name))}`;
  const entityName = upperFirst(camelCase(tableInfo.table_name));
  const pluralEntityName = pluralize(camelCase(tableInfo.table_name));

  if (tableInfo.type === 'many') {
    const paramName = pluralize(camelCase(tableInfo.parentCol.name));
    const variableName = camelCase(pluralEntityName);

    lines.push('  /**');
    lines.push(
      `   * Validates ${sentenceCase(pluralEntityName.toLowerCase())} by their ${paramName}.`,
    );
    lines.push('   * @private');
    lines.push('   */');
    lines.push(`  private async ${methodName}(`);
    lines.push('    user: IUserToken,');
    lines.push(`    ${paramName}: ${tableInfo.parentCol.type}[],`);
    lines.push(`  ): Promise<I${entityName}[]> {`);
    lines.push(`    if (!${paramName} || ${paramName}.length === 0) {`);
    lines.push('      return [];');
    lines.push('    }');
    lines.push('');
    lines.push(
      `    const ${variableName} = await this.${camelCase(tableInfo.table_name)}Repository.getByCodes(user, ${paramName});`,
    );
    lines.push(`    if (${variableName}.length !== ${paramName}.length) {`);
    lines.push(
      `      const foundCodes = ${variableName}.map((item) => item.${camelCase(tableInfo.parentCol.name)});`,
    );
    lines.push(
      `      const missingCodes = ${paramName}.filter((code) => !foundCodes.includes(code));`,
    );
    lines.push('');
    lines.push('      this.logger.warn(');
    lines.push('        {');
    lines.push('          component: COMPONENT_NAME,');
    lines.push(`          method: '${methodName}',`);
    lines.push('          user: user.sub,');
    lines.push(`          requestedCodes: ${paramName},`);
    lines.push('          foundCodes,');
    lines.push('          missingCodes,');
    lines.push('        },');
    lines.push(
      `        'Some ${sentenceCase(pluralEntityName.toLowerCase())} not found',`,
    );
    lines.push('      );');
    lines.push('');
    lines.push(
      `      throw new ${className}DomainException(${className}ExceptionMessage.${camelCase(pluralize(complexObject.tableName || tableInfo.table_name))}NotFound);`,
    );
    lines.push('    }');
    lines.push('');
    lines.push(`    return ${variableName};`);
    lines.push('  }');
  } else {
    const paramName = camelCase(tableInfo.parentCol.name);
    const variableName = camelCase(tableInfo.table_name);

    lines.push('  /**');
    lines.push(
      `   * Validates ${sentenceCase(pluralEntityName.toLowerCase())} by their codes.`,
    );
    lines.push('   * @private');
    lines.push('   */');
    lines.push(`  private async ${methodName}(`);
    lines.push('    user: IUserToken,');
    lines.push(`    ${paramName}?: ${tableInfo.parentCol.type},`);
    lines.push(`  ): Promise<I${entityName} | null> {`);
    lines.push(`    if (!${paramName}) {`);
    lines.push('      return null;');
    lines.push('    }');
    lines.push('');
    lines.push(
      `    const ${variableName} = await this.${camelCase(tableInfo.table_name)}Repository.get(user, ${paramName});`,
    );
    lines.push(`    if (!${variableName}) {`);
    lines.push('      this.logger.warn(');
    lines.push('        {');
    lines.push('          component: COMPONENT_NAME,');
    lines.push(`          method: '${methodName}',`);
    lines.push('          user: user.sub,');
    lines.push(`          ${paramName},`);
    lines.push('        },');
    lines.push(
      `        '${sentenceCase(tableInfo.table_name.toLowerCase())} not found',`,
    );
    lines.push('      );');
    lines.push('');
    lines.push(
      `      throw new ${className}DomainException(${className}ExceptionMessage.${camelCase(pluralize(complexObject.tableName || tableInfo.table_name))}NotFound);`,
    );
    lines.push('    }');
    lines.push('');
    lines.push(`    return ${variableName};`);
    lines.push('  }');
  }
  lines.push('');
};

/**
 * Helper function to generate snapshot conversion methods for JSON columns with relationships
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 */
const generateSnapshotConversionMethods = (schema, table, imports, lines) => {
  const { className } = getTableProperties(schema, table);
  const complexObjects = getComplexObjects(schema, table);

  table.cols.forEach((col) => {
    const relationship = table._relationships?.find(
      (r) => r.childCol === col.name && col.datatype === 'JSON',
    );

    if (relationship) {
      generateSnapshotConversionMethod(
        schema,
        table,
        imports,
        lines,
        col,
        relationship,
        complexObjects,
      );
    }
  });
};

/**
 * Helper function to generate a single snapshot conversion method
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} col - Column definition
 * @param {Object} relationship - Relationship definition
 * @param {Array} complexObjects - Complex objects array
 */
const generateSnapshotConversionMethod = (
  schema,
  table,
  imports,
  lines,
  col,
  relationship,
  complexObjects,
) => {
  const { className } = getTableProperties(schema, table);
  const parentTableName = relationship.parentTable;
  const parentClassName = upperFirst(camelCase(parentTableName));
  const columnName = camelCase(col.name);
  const methodName = `convert${parentClassName}ToSnapshot`;

  // Add required imports
  addImport(
    imports,
    `../../../${kebabCase(parentTableName)}/domain/entities`,
    `I${parentClassName}`,
  );
  addImport(
    imports,
    `../../../${kebabCase(parentTableName)}/domain/properties`,
    `Snapshot${parentClassName}Props`,
  );

  // Find if this is a complex object
  const complexObject = complexObjects.find(
    (co) => co.tableName === parentTableName,
  );

  if (complexObject) {
    // Generate complex object conversion method
    generateComplexObjectSnapshotConversion(
      schema,
      table,
      imports,
      lines,
      col,
      relationship,
      complexObject,
    );
  } else {
    // Generate simple object conversion method
    generateSimpleObjectSnapshotConversion(
      schema,
      table,
      imports,
      lines,
      col,
      relationship,
    );
  }
};

/**
 * Helper function to generate complex object snapshot conversion
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} col - Column definition
 * @param {Object} relationship - Relationship definition
 * @param {Object} complexObject - Complex object definition
 */
const generateComplexObjectSnapshotConversion = (
  schema,
  table,
  imports,
  lines,
  col,
  relationship,
  complexObject,
) => {
  const parentClassName = upperFirst(camelCase(relationship.parentTable));
  const columnName = camelCase(col.name);
  const methodName = `convert${parentClassName}ToSnapshot`;

  // Add JSDoc documentation
  lines.push('  /**');
  lines.push(
    `   * Converts I${parentClassName} to Snapshot${parentClassName}Props for persistence`,
  );
  lines.push('   * @privatexxxx');
  lines.push('   */');

  // Generate method signature
  if (col.defaultvalue === 'object()') {
    lines.push(
      `  private ${methodName}(${columnName}:  Record<string, I${parentClassName}>): Record<string, Snapshot${parentClassName}Props> {`,
    );
  } else {
    lines.push(
      `  private ${methodName}(${columnName}: I${parentClassName}): Snapshot${parentClassName}Props {`,
    );
  }
  lines.push('    return {');

  // Generate property mappings based on complex relationships
  const complexRelationships = getComplexRelationships(schema, table);
  complexRelationships.forEach((rel) => {
    const childCol = Object.values(schema.tables)
      .find((t) => t.name === rel.childTable)
      ?.cols.find((c) => c.name === rel.childCol);
    if (childCol) {
      const propertyName = camelCase(rel.childCol);
      const nullableModifier = childCol.nn ? '' : '?';

      if (rel.c_ch === 'many' && rel.c_p === 'many') {
        if (col.defaultvalue === 'object()') {
          lines.push(`      ${propertyName}: ${columnName}.${propertyName},`);
        } else {
          // Many-to-many relationship - map array of items to their IDs
          lines.push(
            `      ${propertyName}: ${columnName}.${propertyName}${nullableModifier}.map((item) => item.${camelCase(rel.parentCol)}),`,
          );
        }
      } else {
        // One-to-one or one-to-many relationship - get the ID
        lines.push(
          `      ${propertyName}: ${columnName}.${propertyName}${nullableModifier}.${camelCase(rel.parentCol)},`,
        );
      }
    }
  });

  lines.push('    };');
  lines.push('  }');
  lines.push('');
};

/**
 * Helper function to generate simple object snapshot conversion
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} imports - Imports object
 * @param {Array} lines - Code lines array
 * @param {Object} col - Column definition
 * @param {Object} relationship - Relationship definition
 */
const generateSimpleObjectSnapshotConversion = (
  schema,
  table,
  imports,
  lines,
  col,
  relationship,
) => {
  const parentClassName = upperFirst(camelCase(relationship.parentTable));
  const columnName = camelCase(col.name);
  const methodName = `convert${parentClassName}ToSnapshot`;

  // Determine if this is a record set (many-to-many with object() default)
  const isRecordset =
    relationship.c_p === 'many' &&
    relationship.c_ch === 'many' &&
    col.defaultvalue === 'object()';

  // Add JSDoc documentation
  lines.push('  /**');
  if (isRecordset) {
    lines.push(
      `   * Converts Record<string, I${parentClassName}> to Record<string, Snapshot${parentClassName}Props> for persistence`,
    );
  } else {
    lines.push(
      `   * Converts I${parentClassName} to Snapshot${parentClassName}Props for persistence`,
    );
  }
  lines.push('   * @private');
  lines.push('   */');

  // Generate method signature
  if (isRecordset) {
    lines.push(
      `  private ${methodName}(${columnName}: Record<string, I${parentClassName}>): Record<string, Snapshot${parentClassName}Props> {`,
    );
  } else {
    lines.push(
      `  private ${methodName}(${columnName}: I${parentClassName}): Snapshot${parentClassName}Props {`,
    );
  }

  lines.push('    return {');
  lines.push(
    '      // Explicit property mapping ensures type safety and domain separation',
  );
  lines.push(`      ...${columnName},`);

  if (isRecordset) {
    lines.push(`    } as Record<string, Snapshot${parentClassName}Props>;`);
  } else {
    lines.push(`    } as Snapshot${parentClassName}Props;`);
  }

  lines.push('  }');
  lines.push('');
};

/**
 * Main function to generate repository code
 * @param {Object} schema - Database schema
 * @param {Object} table - Table definition
 * @param {Object} errors - Error tracking object
 * @returns {string} Generated repository code
 */
const generateRepository = (schema, table, errors) => {
  const { className, primaryCol, idxCols } = getTableProperties(schema, table);
  const storageType = getStorageType(schema, table.name);
  const hasCommand =
    isOperationEnabled(schema, table.name, 'create') ||
    isOperationEnabled(schema, table.name, 'update') ||
    isOperationEnabled(schema, table.name, 'delete');

  // Get relationships and complex objects
  const uniqueRelationships = getUniqueRelationships(schema, table);
  const complexRelationships = getComplexRelationships(schema, table);
  const complexObjects = getComplexObjects(schema, table);
  const moduleName = upperFirst(camelCase(schema.service.module));

  // Determine storage requirements
  const hasEventStream =
    schema.parameters[table.name]?.store?.read === 'eventstream' ||
    schema.parameters[table.name]?.store?.write === 'eventstream';
  const hasRedis =
    schema.parameters[table.name]?.store?.read === 'redis' ||
    schema.parameters[table.name]?.store?.write === 'redis' ||
    schema.parameters[table.name]?.store?.list === 'redis';
  // uniqueRelationships.some(
  //   (rel) => getStorageType(schema, rel.parentTable) === 'redis',
  // );
  const hasSql =
    storageType === 'sql' ||
    uniqueRelationships.some(
      (rel) => getStorageType(schema, rel.parentTable) === 'sql',
    );
  const hasMongo =
    storageType === 'mongo' ||
    uniqueRelationships.some(
      (rel) => getStorageType(schema, rel.parentTable) === 'mongo',
    );

  const projectorType = getProjectionType(schema, table);

  let hasProjector = projectorType ? true : false;
  const projector = `${className}${upperFirst(projectorType)}Projection`;

  // Initialize imports and code lines
  const imports = {
    'src/shared/logger': new Set(['ILogger']),
    'src/shared/auth': new Set(['IUserToken']),
    '@nestjs/common': new Set(['Inject']),
    '@nestjs/config': new Set(['ConfigService']),
  };

  // Add domain imports
  addImport(imports, '../../domain/entities', `I${className}`);
  addImport(imports, '../../domain/exceptions', [
    `${className}DomainException`,
    `${className}ExceptionMessage`,
  ]);
  if (hasCommand) {
    addImport(imports, '@nestjs/cqrs', `IEvent`);
    addImport(imports, '../../domain/aggregates', className);
  }
  // Add conditional imports based on features
  if (hasEventStream) {
    addImport(imports, 'src/shared/infrastructure/event-store', [
      `EventOrchestrationService`,
      `SnapshotService`,
    ]);
  }
  if (hasProjector) {
    addImport(imports, '../projectors', projector);
  }

  if (hasMongo) {
    addImport(imports, 'src/shared/infrastructure', 'MongoUtilityService');
  }

  // Add operation-specific imports
  if (isOperationEnabled(schema, table.name, 'create')) {
    addImport(imports, '../../domain/events', `${className}CreatedEvent`);
  }
  if (isOperationEnabled(schema, table.name, 'update')) {
    addImport(imports, '../../domain/events', `${className}UpdatedEvent`);
  }
  if (isOperationEnabled(schema, table.name, 'delete')) {
    addImport(imports, '../../domain/events', `${className}DeletedEvent`);
  }

  // Add list-specific imports if table has indexes
  if (idxCols.length) {
    addImport(imports, '../../domain/properties', [
      `${className}Page`,
      `List${className}PropsOptions`,
    ]);
  }

  // Initialize code lines
  const lines = ['', `const COMPONENT_NAME = '${className}Repository';`, ''];

  // Generate class declaration

  if (hasRedis || hasEventStream) {
    addImport(
      imports,
      `../../domain/value-objects/${kebabCase(className)}-projection-keys`,
      `${className}ProjectionKeys`,
    );
  }
  if (hasCommand) {
    if (
      schema.parameters[table.name]?.store.read === 'eventstream' ||
      schema.parameters[table.name]?.store.write === 'eventstream'
    ) {
      addImport(imports, 'src/shared/domain', ['DomainEvent', 'ISagaContext']);
      addImport(
        imports,
        'src/shared/infrastructure/repositories',
        'SagaCommandRepository',
      );
      lines.push(
        `export class ${className}Repository extends SagaCommandRepository<I${className}, ${className}, typeof ${className}ExceptionMessage> {`,
      );

      lines.push(`
  private static readonly SERVICE_NAME =
    ${moduleName}ServiceConstants.SERVICE_NAME;
`);
    } else {
      addImport(
        imports,
        'src/shared/infrastructure/repositories',
        'DomainCommandRepository',
      );
      lines.push(
        `export class ${className}Repository extends DomainCommandRepository<I${className}, ${className}, typeof ${className}ExceptionMessage> {`,
      );
    }
  } else {
    addImport(imports, 'src/shared/infrastructure/repositories', [
      `InfrastructureRepository`,
    ]);
    lines.push(
      `export class ${className}Repository extends InfrastructureRepository<typeof ${className}ExceptionMessage> {`,
    );
  }

  addImport(imports, '../../../shared/domain/value-objects', [
    `${moduleName}LoggingHelper`,
    `${moduleName}ServiceConstants`,
  ]);

  // Setup repository dependencies
  setupRepositoryDependencies(
    schema,
    table,
    imports,
    lines,
    uniqueRelationships,
    hasRedis,
    hasEventStream,
    hasSql,
    hasMongo,
  );

  // Setup constructor
  setupConstructorDependencies(
    schema,
    table,
    imports,
    lines,
    uniqueRelationships,
    complexRelationships,
    hasRedis,
    hasEventStream,
    hasSql,
    hasMongo,
  );

  // Initialize repository instances in constructor
  if (hasCommand) {
    lines.push(
      '    super(configService, logger, ' +
        className +
        'ExceptionMessage, ' +
        className +
        ');',
    );
  } else {
    lines.push(
      '    super(configService, logger, ' + className + 'ExceptionMessage);',
    );
  }

  if (storageType === 'sql') {
    lines.push(
      `    this.${camelCase(table.name)}Repository = dataSource.getRepository(${className}Entity);`,
    );
  }

  uniqueRelationships.forEach((relation) => {
    if (
      isJoinTableValid(
        schema.parameters[relation.parentTable]?.store,
        schema.parameters[relation.childTable]?.store,
      )
    ) {
      lines.push(
        `    this.${camelCase(relation.parentClass)}Repository = dataSource.getRepository(${upperFirst(camelCase(relation.parentClass))}Entity);`,
      );
    }
  });

  lines.push('  }', '');
  if (
    schema.parameters[table.name]?.store.read === 'eventstream' ||
    schema.parameters[table.name]?.store.write === 'eventstream'
  ) {
    lines.push(`
  /**
   * Generates entity-level stream name following: <context>.<aggregate>.<version>-<tenant>-<entityId>
   * Each ${camelCase(className)} gets its own stream for optimal performance
   * Example: banking.${camelCase(className)}.v1-tenant123-USD
   */
  private buildStreamName(tenant: string, ${camelCase(className)}Code: string): string {
    return ${className}ProjectionKeys.getEventStoreStreamName(tenant, ${camelCase(className)}Code);
  }
`);
  }
  // Generate event methods for command repositories
  generateEventMethods(schema, table, imports, lines, hasCommand);
  // Generate get method
  const getMethodGenerators = {
    sql: ormRepositoryGet,
    redis: redisRepositoryGet,
    eventstream: esdbRepositoryGet,
    mongo: mongoRepositoryGet,
    default: noopRepositoryGet,
  };

  generateMethodByStorageType(
    storageType,
    getMethodGenerators,
    schema,
    table,
  ).forEach((line) => lines.push(line));

  lines.push(`
  async get${className}(user: IUserToken, ${camelCase(primaryCol.name)}: ${primaryCol.type}): Promise<I${className}> {
    const result = await this.get(user, ${camelCase(primaryCol.name)});
    if (!result) {
      throw new ${className}DomainException(${className}ExceptionMessage.notFound);
    }
    return result;
  }
`);
  if (hasCommand) {
    lines.push(`  /**
   * ✅ CLEAN: Repository delegates aggregate creation to domain factory
   * No knowledge of internal domain structure required
   */
  protected createAggregate(user: IUserToken, entity: I${className}): ${className} {
    return ${className}.fromEntity(entity);
  }
`);
  }
  // Generate list method if table has indexes
  if (idxCols.length) {
    addImport(imports, '../../domain/properties', [
      `List${className}OrderEnum`,
      `List${className}PropsOptions`,
      `${className}Page`,
    ]);

    const listMethodGenerators = {
      sql: ormRepositoryList,
      redis: redisRepositoryList,
      eventstream: esdbRepositoryList,
      mongo: mongoRepositoryList,
      default: noopRepositoryList,
    };

    if (storageType === 'sql') {
      addImport(imports, 'typeorm', [
        'FindOptionsOrder',
        'FindOptionsWhere',
        'ILike',
      ]);
    }

    generateMethodByStorageType(
      storageType,
      listMethodGenerators,
      schema,
      table,
    ).forEach((line) => lines.push(line));
  }

  // Generate getByCodes method if single primary key and batch operations enabled
  if (primaryCol && isOperationEnabled(schema, table.name, 'batch')) {
    const getByCodesMethodGenerators = {
      sql: ormRepositoryGetByCodes,
      redis: redisRepositoryGetByCodes,
      eventstream: esdbRepositoryGetByCodes,
      mongo: mongoRepositoryGetByCodes,
      default: noopRepositoryGetByCodes,
    };

    if (storageType === 'sql') {
      addImport(imports, 'typeorm', 'In');
    }

    generateMethodByStorageType(
      storageType,
      getByCodesMethodGenerators,
      schema,
      table,
    ).forEach((line) => lines.push(line));
  }

  // Generate save method if command operations enabled
  if (hasCommand) {
    const saveMethodGenerators = {
      sql: ormRepositorySave,
      redis: redisRepositorySave,
      eventstream: esdbRepositorySave,
      mongo: mongoRepositorySave,
      default: noopRepositorySave,
    };

    if (storageType === 'sql') {
      addImport(imports, 'typeorm', 'In');
    }

    generateMethodByStorageType(
      storageType,
      saveMethodGenerators,
      schema,
      table,
    ).forEach((line) => lines.push(line));

    // Generate delete method if delete operations enabled
    if (isOperationEnabled(schema, table.name, 'delete')) {
      const deleteMethodGenerators = {
        sql: ormRepositoryDelete,
        redis: redisRepositoryDelete,
        eventstream: esdbRepositoryDelete,
        mongo: mongoRepositoryDelete,
        default: noopRepositoryDelete,
      };

      generateMethodByStorageType(
        storageType,
        deleteMethodGenerators,
        schema,
        table,
      ).forEach((line) => lines.push(line));
    }
  }
  // Generate relationship methods
  generateRelationshipMethods(
    schema,
    table,
    imports,
    lines,
    uniqueRelationships,
    errors,
  );

  // Generate complex object methods
  generateComplexObjectMethods(
    schema,
    table,
    imports,
    lines,
    complexObjects,
    errors,
  );

  // Generate snapshot conversion methods for JSON columns with relationships
  generateSnapshotConversionMethods(schema, table, imports, lines);

  // Generate hydration methods

  if (storageType === 'sql') {
    ormRepositoryHydrateComplexObjects(schema, table).forEach((line) =>
      lines.push(line),
    );
  } else {
    addImport(imports, '../../domain/properties', `Snapshot${className}Props`);
    repositoryHydrateComplexObjects(schema, table).forEach((line) =>
      lines.push(line),
    );
  }

  lines.push('}');
  return buildImportLines(imports) + '\n' + lines.join('\n');
};

// Export functions for testing
module.exports = {
  generateRepository,
  generateComplexObjectMethods,
  generateComplexObjectMethod,
  generateComplexObjectValidationMethod,
  generateRelationshipMethods,
  generateManyToManyMethods,
  generateSingleRelationshipMethod,
  generateSnapshotConversionMethods,
  generateSnapshotConversionMethod,
  generateComplexObjectSnapshotConversion,
  generateSimpleObjectSnapshotConversion,
  getStorageType,
  isOperationEnabled,
  setupRepositoryDependencies,
  setupConstructorDependencies,
  generateMethodByStorageType,
  generateEventMethods,
};
