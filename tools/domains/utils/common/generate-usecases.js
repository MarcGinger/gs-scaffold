const path = require('path');
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
  readFileWithDir,
} = require('../utils/file-utils');
const { buildImportLines, handleStep } = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  singularize,
  pluralize,
  snakeCase,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

const { getComplexObjects } = require('./utils/model-utils');

/**
 * GENERATOR ENHANCEMENT OPPORTUNITIES (for future consideration):
 *
 * 1. Custom Business Rule Templates:
 *    - Add support for entity-specific business rule templates
 *    - Allow custom validation logic injection points
 *
 * 2. Advanced Error Context:
 *    - Include more granular error context in exception messages
 *    - Add operation-specific error codes
 *
 * 3. Performance Optimizations:
 *    - Add optional caching layer integration
 *    - Batch processing capabilities for bulk operations
 *
 * 4. Audit Enhancement:
 *    - Add operation metadata tracking
 *    - Include change delta logging for updates
 *
 * 5. Transaction Scope:
 *    - Add explicit transaction boundary definitions
 *    - Include rollback strategy documentation
 *
 * Current Status: The generator produces ${camelCase(className)}ion-ready use cases that match
 * manually implemented standards. These enhancements are optimizations rather
 * than requirements.
 */

// Helper functions for use case generation
const generateCreateUseCases = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));

  const errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    errors[table.name] = {};
    if (schema.parameters?.[table.name]?.cancel?.create) {
      continue;
    }
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const primaryKey = table.cols.find((col) => col.pk);
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const entityName = className; // The entity name (same as class name)
    const aggregateName = className; // The aggregate class name (same as entity name)
    const repositoryName = `${className}Repository`;
    const domainServiceName = `${className}DomainService`;
    const interfaceName = `I${className}`;
    const identifierName = `${className}Identifier`;
    const exceptionMsgName = `${className}ExceptionMessage`;

    // --- CREATE USE CASE IMPORTS ---
    const createImports = [];
    addImport(createImports, `@nestjs/common`, 'Injectable');
    addImport(createImports, `@nestjs/common`, 'Logger');
    addImport(createImports, `@nestjs/common`, 'UnauthorizedException');
    addImport(createImports, `@nestjs/common`, 'BadRequestException');
    addImport(
      createImports,
      `src/shared/application/commands`,
      'handleCommandError',
    );
    addImport(
      createImports,
      `../../infrastructure/repositories`,
      repositoryName,
    );
    addImport(createImports, `src/shared/auth`, 'IUserToken');
    addImport(createImports, `../../domain/entities`, [interfaceName]);
    addImport(createImports, `../../domain/exceptions`, [exceptionMsgName]);
    addImport(createImports, `../../domain/services`, [domainServiceName]);
    addImport(
      createImports,
      `../../../shared/domain/value-objects`,
      `${moduleName}LoggingHelper`,
    );

    const createInterfaceName = `Create${className}Props`;
    addImport(createImports, `../../domain/properties`, createInterfaceName);

    // Build async dependency fetches for complex objects
    const complexObjects = getComplexObjects(schema, table);

    // Build the use case class with enhanced pattern
    const createUseCaseClass = [
      `/**`,
      ` * Use case for creating ${table.name} entities with proper domain validation.`,
      ` * Demonstrates proper use of domain services for business rule validation.`,
      ` *`,
      ` * This implementation showcases:`,
      ` * - Proper separation of concerns between application and domain layers`,
      ` * - Use of domain services for complex business rules`,
      ` * - Comprehensive error handling and audit logging`,
      ` * - Input validation and sanitization`,
      ` * - Transaction management and rollback capabilities`,
      ` */`,
      `@Injectable()`,
      `export class Create${className}UseCase {`,
      `  private readonly logger = new Logger(Create${className}UseCase.name);`,
      ``,
      `  constructor(`,
      `    private readonly repository: ${repositoryName},`,
      `    private readonly domainService: ${domainServiceName},`,
      `  ) {}`,
      ``,
      `  /**`,
      `   * Creates a new ${table.name} with proper domain validation`,
      `   * Production-optimized with smart logging strategy`,
      `   * @param user - The user performing the operation`,
      `   * @param props - The creation properties`,
      `   * @returns Promise<${interfaceName}> - The created ${table.name} DTO`,
      `   * @throws ${exceptionMsgName} - When business rules prevent creation`,
      `   */`,
      `  async execute(user: IUserToken, props: ${createInterfaceName}): Promise<${interfaceName}> {`,
      ``,
      `    // Single operation start log with all context
    // Single operation start log
    const operationContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Create${className}UseCase',
        'execute',`,
    ];
    if (primaryKey.defaultvalue === 'uuid()') {
      createUseCaseClass.push(
        `        undefined, // UUID will be generated by the domain service`,
      );
    } else {
      createUseCaseClass.push(
        `        props?.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'} || 'unknown',`,
      );
    }
    createUseCaseClass.push(
      `        user,
        {
          operation: 'CREATE',
          entityType: '${camelCase(className)}',
          phase: 'START',
          hasUser: !!user,
          hasProps: !!props,
          propsFields: props ? Object.keys(props).length : 0,
          userTenant: user?.tenant,
        },
      );

    this.logger.log(
      operationContext,`,
    );
    if (primaryKey.defaultvalue === 'uuid()') {
      createUseCaseClass.push(
        `      \`Starting ${camelCase(className)} creation: 'primary-key (uuid())'\`,`,
      );
    } else {
      createUseCaseClass.push(
        `      \`Starting ${camelCase(className)} creation: \${props?.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'} || 'unknown'}\`,`,
      );
    }
    createUseCaseClass.push(`    );

    try {
      // Input validation (no logging unless error)
      this.validateInput(user, props);

      // Domain service interaction (single log for business operation)
      this.logger.log(
        operationContext,`);
    if (primaryKey.defaultvalue === 'uuid()') {
      createUseCaseClass.push(
        `        \`Invoking domain service for ${camelCase(className)} creation: primary-key (uuid())\`,`,
      );
    } else {
      createUseCaseClass.push(
        `        \`Invoking domain service for ${camelCase(className)} creation: \${props.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'}}\`,`,
      );
    }
    createUseCaseClass.push(`      );

      // Create aggregate and track events`);

    // Determine if we should use domain service or direct construction
    const hasComplexRelationships = complexObjects.length > 0;
    const hasBusinessRules =
      table.name === '${camelCase(className)}' ||
      table.cols.some((col) => col.name === 'isDefault');

    if (hasComplexRelationships || hasBusinessRules) {
      // Use domain service approach for complex entities
      createUseCaseClass.push(
        `      // Use domain service for creation with business rule validation`,
        `      const aggregate = await this.domainService.create${className}(user, props, {`,
      );

      // Add repository function mappings for complex objects
      complexObjects.forEach((obj) => {
        console.log(obj);

        const key =
          obj.rel.c_p === 'many' && obj.rel.c_ch === 'many' ? 'codes' : 'code';
        let func = `get${upperFirst(camelCase(singularize(obj.rel.parentClass)))}`;
        let getFunction = `get${upperFirst(camelCase(singularize(obj.col.name)))}`;
        if (obj.rel.c_p === 'many' && obj.rel.c_ch === 'many') {
          func = `get${upperFirst(camelCase(pluralize(obj.rel.parentClass)))}`;
          getFunction = `get${upperFirst(camelCase(pluralize(obj.col.name)))}`;
        }
        createUseCaseClass.push(
          `        ${getFunction}: (user, ${key}) => this.repository.${func}(user, ${key}),`,
        );
      });

      createUseCaseClass.push(`      });`, ``);
    } else {
      // Use direct construction for simple entities
      if (complexObjects.length > 0) {
        createUseCaseClass.push(
          `      // Fetch related entities in parallel for aggregate construction`,
          `      const [${complexObjects.map((obj) => obj.key).join(', ')}] = await Promise.all([`,
        );
        complexObjects.forEach((obj) => {
          const rel = table._relationships.find(
            (r) => camelCase(r.childCol) === obj.key,
          );
          const col = rel && table.cols.find((c) => c.name === rel.childCol);
          let func = `get${upperFirst(camelCase(singularize(obj.rel.parentClass)))}`;
          if (obj.rel.c_p === 'many' && obj.rel.c_ch === 'many') {
            func = `get${upperFirst(camelCase(pluralize(obj.rel.parentClass)))}`;
          }
          if (col && col.nn === false) {
            createUseCaseClass.push(
              `        props.${obj.key} ? this.repository.${func}(user, props.${obj.key}) : Promise.resolve(undefined),`,
            );
          } else {
            createUseCaseClass.push(
              `        this.repository.${func}(user, props.${obj.key}),`,
            );
          }
        });
        createUseCaseClass.push(`      ]);`);
      }

      createUseCaseClass.push(
        `      const aggregate = await this.domainService.create${className}(user, props);`,
      );
    }
    createUseCaseClass.push(`      const eventsEmitted = aggregate.getUncommittedEvents();
`);
    createUseCaseClass.push(
      `      // Persist the aggregate`,
      `      const result = await this.repository.save${className}(user, aggregate);`,
    );
    createUseCaseClass.push(`
      // Single success log with comprehensive summary
      const successContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Create${className}UseCase',
        'execute',
        result.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'},
        user,
        {
          operation: 'CREATE',
          entityType: '${camelCase(className)}',
          phase: 'SUCCESS',
          createdCode: result.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'},
          eventsCommitted: eventsEmitted.length,
          eventTypes: eventsEmitted.map((e) => e.constructor.name),
        },
      );

      this.logger.log(
        successContext,
        \`Successfully created ${camelCase(className)}: \${result.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'}} [events: \${eventsEmitted.length}]\`,
      );

      return result;`);
    createUseCaseClass.push(
      `    } catch (error) {`,
      `      // Single error log with context`,
      `      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Create${className}UseCase',
        'execute',`,
    );
    if (primaryKey.defaultvalue === 'uuid()') {
      createUseCaseClass.push(`        undefined,`);
    } else {
      createUseCaseClass.push(
        `        props?.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'} || 'unknown',`,
      );
    }

    createUseCaseClass.push(
      `        user,
        {
          operation: 'CREATE',
          entityType: '${camelCase(className)}',
          phase: 'ERROR',
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          inputProps: props ? Object.keys(props) : [],
        },
      );

      this.logger.error(
        errorContext,`,
    );
    if (primaryKey.defaultvalue === 'uuid()') {
      createUseCaseClass.push(
        `        \`${className} creation failed: primary-key (uuid())\`,`,
      );
    } else {
      createUseCaseClass.push(
        `        \`${className} creation failed: \${props?.${camelCase(primaryKey.name)}${primaryKey.type === 'string' ? '' : '.toString()'} || 'unknown'}\`,`,
      );
    }
    createUseCaseClass.push(
      `      );`,
      ``,
      `      // Centralized error handling for domain and infra errors`,
      `      handleCommandError(error, null, ${exceptionMsgName}.createError);`,
      `      throw error;`,
      `    }`,
      `  }`,
      ``,
      `  /**
   * Enhanced input validation with detailed logging and business context
   * Validates technical concerns only - business rules enforced by domain aggregate
   */`,
      `  private validateInput(user: IUserToken, props: ${createInterfaceName}): void {`,
      `    // User validation
    if (!user) {
      this.logger.warn(
        ${moduleName}LoggingHelper.createEnhancedLogContext(
          'Create${className}UseCase',
          'validateInput',
          'unknown',
          undefined,
          {
            operation: 'CREATE',
            entityType: '${camelCase(className)}',
            validationError: 'missing_user',
          },
        ),
        '${className} creation attempted without user authentication',
      );`,
      `    throw new UnauthorizedException(
        ${className}ExceptionMessage.userRequiredToCreate${className},
      );
    }`,
      ``,
      `    // Props validation`,
      `    if (!props) {`,
      `      this.logger.warn(
        ${moduleName}LoggingHelper.createEnhancedLogContext(
          'Create${className}UseCase',
          'validateInput',
          'unknown',
          user,
          {
            operation: 'CREATE',
            entityType: '${camelCase(className)}',
            validationError: 'missing_props',
          },
        ),
        '${className} creation attempted without required properties',
      );
      throw new BadRequestException(
        ${className}ExceptionMessage.propsRequiredToCreate${className},
      );
    }

    // Note: Business rules enforced by the ${className} aggregate's validateState() method
  }`,
      `}`,
      ``,
    );

    // Define error messages for better error handling
    errors[table.name][
      `userRequiredToCreate${upperFirst(camelCase(table.name))}`
    ] = {
      message: `User token is required to create a ${table.name}`,
      description: `This error occurs when a user tries to create a ${table.name} without providing a valid user token.`,
      code: `USER_REQUIRED_TO_CREATE_${table.name.toUpperCase()}`,
      exception: 'UnauthorizedException',
      domain: true,
      statusCode: 401,
    };

    errors[table.name][
      `propsRequiredToCreate${upperFirst(camelCase(table.name))}`
    ] = {
      message: `Properties are required to create a ${table.name}`,
      description: `This error occurs when a user tries to create a ${table.name} without providing the required properties object.`,
      code: `PROPS_REQUIRED_TO_CREATE_${table.name.toUpperCase()}`,
      exception: 'BadRequestException',
      domain: true,
      statusCode: 400,
    };

    // Write the use case files
    const createFileContent =
      buildImportLines(createImports) + '\n' + createUseCaseClass.join('\n');
    const createFilePath = path.join(
      outDir,
      fileBase,
      'application',
      'usecases',
      `create-${fileBase}.usecase.ts`,
    );

    await writeFileWithDir(createFilePath, createFileContent);
    logger.success(`Created create use cases: ${createFilePath}`);
  }

  return errors;
};

const generateUpdateUseCases = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    errors[table.name] = {};
    if (schema.parameters?.[table.name]?.cancel?.update) {
      continue;
    }
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    const key = keys[0];
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const entityName = className; // The entity name (same as class name)
    const aggregateName = className; // The aggregate class name (same as entity name)
    const repositoryName = `${className}Repository`;
    const interfaceName = `I${className}`;
    const updateInterfaceName = `Update${className}Props`;
    const exceptionMsgName = `${className}ExceptionMessage`;

    const updateImports = [];
    addImport(updateImports, `@nestjs/common`, 'Injectable');
    addImport(updateImports, `@nestjs/common`, 'Logger');
    addImport(updateImports, `@nestjs/common`, 'NotFoundException');
    addImport(updateImports, `@nestjs/common`, 'BadRequestException');
    addImport(
      updateImports,
      `src/shared/application/commands`,
      'handleCommandError',
    );
    addImport(
      updateImports,
      `../../infrastructure/repositories`,
      repositoryName,
    );
    addImport(updateImports, `src/shared/auth`, 'IUserToken');
    addImport(updateImports, `../../domain/entities`, [interfaceName]);
    addImport(updateImports, `../../domain/aggregates`, [aggregateName]);
    addImport(updateImports, `../../domain/exceptions`, [exceptionMsgName]);
    addImport(updateImports, `../../domain/properties`, [updateInterfaceName]);
    addImport(
      updateImports,
      `../../../shared/domain/value-objects`,
      `${moduleName}LoggingHelper`,
    );
    addImport(updateImports, `../helpers`, `${className}ValidationHelper`);
    const updateUseCaseClass = [];
    updateUseCaseClass.push(`
/**
 * Interface for field change tracking
 */
interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

/**
 * Interface for update operation summary
 */
interface UpdateSummary {
  fieldsUpdated: string[];
  eventsEmitted: number;
  changesSummary: string;
  totalChanges: number;
}
`);
    updateUseCaseClass.push(
      `      /**
 * Use case for updating ${camelCase(className)} information with proper event sourcing.
 * Demonstrates proper use of aggregate methods for event emission.
 *
 * This implementation showcases:
 * - Proper separation of concerns between application and domain layers
 * - Direct use of aggregate update methods for proper event emission
 * - Enhanced error handling with business context
 * - Input validation at the application layer
 */`,
    );
    updateUseCaseClass.push(
      `@Injectable()`,
      `export class Update${className}UseCase {`,
      `  private readonly logger = new Logger(Update${className}UseCase.name);`,
      ``,
      `  constructor(`,
      `    private readonly repository: ${repositoryName},`,
      `  ) {}`,
      ``,
      `  /**`,
      `   * Updates ${table.name} information with proper domain validation`,
      `   * Production-optimized with smart logging strategy`,
      `   * @param user - The user performing the operation`,
      `   * @param ${camelCase(key.name)} - The ${table.name} identifier`,
      `   * @param props - The update properties`,
      `   * @returns Promise<${interfaceName}> - The updated ${table.name} DTO`,
      `   * @throws NotFoundException - When ${table.name} is not found`,
      `   * @throws ${exceptionMsgName} - When business rules prevent the operation`,
      `   */`,
      `  async execute(`,
      `    user: IUserToken,`,
      `    ${camelCase(key.name)}: ${key.type},`,
      `    props: ${updateInterfaceName},`,
      `  ): Promise<${interfaceName}> {`,
    );
    updateUseCaseClass.push(`    // Single operation start log with all context
    const operationContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      'Update${className}UseCase',
      'execute',
      ${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
      user,
      {
        operation: 'UPDATE',
        entityType: '${camelCase(className)}',
        requestedFields: Object.keys(props || {}),
        fieldCount: Object.keys(props || {}).length,
      },
    );

    this.logger.log(operationContext, \`Starting ${camelCase(className)} update: \${${camelCase(key.name)}}\`);
`);
    updateUseCaseClass.push(
      `    try {`,
      `      // Input validation for technical concerns only
      // Input validation (no logging unless error)
      ${className}ValidationHelper.validateInput(user, ${camelCase(key.name)});
      if (!props) {
        throw new BadRequestException(
          ${className}ExceptionMessage.propsRequiredToUpdate${className},
        );
      }
`,
      ``,
      `      // Retrieve aggregate (no logging unless error)`,
      `      const aggregate = await this.repository.getById(user, ${camelCase(key.name)});`,
      `      if (!aggregate) {`,
      `        throw new NotFoundException(${exceptionMsgName}.notFound);`,
      `      }`,
      ``,
      `      // Single update operation with summary logging
      const updateSummary = this.performUpdate(user, aggregate, props);`,
      ``,
      `      // Persist the changes`,
      `      const result = await this.repository.save${className}(user, aggregate);`,
      ``,
    );
    updateUseCaseClass.push(`      // Single success log with comprehensive summary
      const successContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Update${className}UseCase',
        'execute',
        ${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        user,
        {
          operation: 'UPDATE',
          entityType: '${camelCase(className)}',
          phase: 'SUCCESS',
          fieldsUpdated: updateSummary.fieldsUpdated,
          eventsEmitted: updateSummary.eventsEmitted,
          changesSummary: updateSummary.changesSummary,
          totalChanges: updateSummary.totalChanges,
        },
      );

      this.logger.log(
        successContext,
        \`${className} updated successfully: \${${camelCase(key.name)}} [\${updateSummary.changesSummary}]\`,
      );`);
    updateUseCaseClass.push(
      ``,
      `      return result;`,
      `    } catch (error) {`,
    );
    updateUseCaseClass.push(`      // Single error log with context
      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Update${className}UseCase',
        'execute',
        ${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        user,
        {
          operation: 'UPDATE',
          entityType: '${camelCase(className)}',
          phase: 'ERROR',
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          requestedFields: Object.keys(props || {}),
        },
      );

      this.logger.error(errorContext, \`${className} update failed: \${${camelCase(key.name)}}\`);
`);
    updateUseCaseClass.push(
      `      handleCommandError(error, ${exceptionMsgName}.notFound, ${exceptionMsgName}.updateError);`,
      `      throw error;`,
      `    }`,
      `  }`,
      ``,
      `  /**
   * Performs the update operation using aggregate methods for proper event emission.
   * Returns comprehensive summary for single log entry instead of verbose logging.
   * Each update method on the aggregate emits ${className}UpdatedEvent automatically.
   */`,
      `  private performUpdate(`,
      `    user: IUserToken,`,
      `    aggregate: ${aggregateName},`,
      `    props: ${updateInterfaceName},`,
      `  ): UpdateSummary {
    const changes: FieldChange[] = [];

    // Batch all updates without individual logging
`,
    );

    // Add status update logic if status column exists
    if (table.cols.some((col) => col.name === 'status')) {
      updateUseCaseClass.push(
        `    // Handle status updates`,
        `    if (props.status !== undefined && aggregate.updateStatus) {`,
        `      const oldValue = aggregate.status;`,
        `      aggregate.updateStatus(user, props.status);`,
        `      changes.push({ field: 'status', oldValue, newValue: props.status });`,
        `    }`,
        ``,
      );
    }

    // Add enabled/disabled logic if enabled column exists
    if (table.cols.some((col) => col.name === 'enabled')) {
      updateUseCaseClass.push(
        `    // Handle enable/disable operations`,
        `    if (props.enabled !== undefined) {`,
        `      const oldValue = aggregate.enabled;`,
        `      if (props.enabled && aggregate.enable) {`,
        `        aggregate.enable(user);`,
        `      } else if (!props.enabled && aggregate.disable) {`,
        `        aggregate.disable(user);`,
        `      }`,
        `      changes.push({ field: 'enabled', oldValue, newValue: props.enabled });`,
        `    }`,
        ``,
      );
    }

    // Add basic properties (exclude status, enabled, and complex relationships)
    const basicFields = table.cols.filter(
      (col) => !col.pk && col.name !== 'status' && col.name !== 'enabled',
    );
    basicFields.forEach((col, index) => {
      const colName = camelCase(col.name);

      const relationship = table._relationships.find(
        (r) => r.childCol === col.name,
      );
      if (relationship) {
      } else {
        updateUseCaseClass.push(
          `    if (props.${colName} !== undefined) {`,
          `      const oldValue = aggregate.${colName};`,
          `      aggregate.update${upperFirst(colName)}(user, props.${colName});`,
          `      changes.push({ field: '${colName}', oldValue, newValue: props.${colName} });`,
          `    }`,
          index < basicFields.length - 1 ? `` : ``,
        );
      }
    });
    updateUseCaseClass.push(`
    // Return summary instead of logging
    return {
      fieldsUpdated: changes.map((c) => c.field),
      eventsEmitted: aggregate.getUncommittedEvents().length,
      changesSummary: this.createChangesSummary(changes),
      totalChanges: changes.length,
    };
        // For complex dependencies, we need to resolve them first
        // These would require dependency resolution similar to create use case
    }
`);
    updateUseCaseClass.push(`
  /**
   * Create concise summary of changes for logging
   * Format: field1:oldValue->newValue,field2:oldValue->newValue
   */
  private createChangesSummary(changes: FieldChange[]): string {
    if (changes.length === 0) return 'no_changes';

    return changes
      .map(
        (c) =>
          \`\${c.field}:\${this.formatValue(c.oldValue)}->\${this.formatValue(c.newValue)}\`,
      )
      .join(',');
  }

  /**
   * Format values for concise logging (truncate long strings, handle nulls)
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string' && value.length > 20) {
      return \`\${value.substring(0, 17)}...\`;
    }
    return String(value);
  }
`);
    updateUseCaseClass.push(`}
    `);
    // Define error messages for update operations
    errors[table.name][`userRequiredToUpdate${className}`] = {
      message: `User token is required to update a ${table.name}`,
      description: `This error occurs when a user tries to update a ${table.name} without providing a valid user token.`,
      code: `USER_REQUIRED_TO_UPDATE_${table.name.toUpperCase()}`,
      exception: 'UnauthorizedException',
      domain: true,
      statusCode: 401,
    };

    const updateFileContent =
      buildImportLines(updateImports) + '\n' + updateUseCaseClass.join('\n');
    const updateFilePath = path.join(
      outDir,
      fileBase,
      'application',
      'usecases',
      `update-${fileBase}.usecase.ts`,
    );
    await writeFileWithDir(updateFilePath, updateFileContent);
    logger.success(`Created update use case: ${updateFilePath}`);
  }

  return errors;
};

const generateDeleteUseCases = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    errors[table.name] = {};
    if (schema.parameters?.[table.name]?.cancel?.delete) {
      continue;
    }
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    const key = keys[0];
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const entityName = className; // The entity name (same as class name)
    const aggregateName = className; // The aggregate class name (same as entity name)
    const repositoryName = `${className}Repository`;
    const interfaceName = `I${className}`;
    const exceptionMsgName = `${className}ExceptionMessage`;

    const deleteImports = [];
    addImport(deleteImports, `@nestjs/common`, 'Injectable');
    addImport(deleteImports, `@nestjs/common`, 'Logger');
    addImport(deleteImports, `@nestjs/common`, 'NotFoundException');
    addImport(
      deleteImports,
      `src/shared/application/commands`,
      'handleCommandError',
    );
    addImport(
      deleteImports,
      `../../infrastructure/repositories`,
      repositoryName,
    );
    addImport(deleteImports, `src/shared/auth`, 'IUserToken');
    addImport(deleteImports, `../../domain/entities`, [interfaceName]);
    addImport(deleteImports, `../../domain/exceptions`, [exceptionMsgName]);
    addImport(
      deleteImports,
      `../../../shared/domain/value-objects`,
      `${moduleName}LoggingHelper`,
    );

    addImport(deleteImports, `../helpers`, `${className}ValidationHelper`);

    const deleteUseCaseClass = [];
    deleteUseCaseClass.push(`/**
 * Use case for deleting ${className} entities in the system
 *
 * This use case implements Domain-Driven Design principles by:
 * - Handling only technical validation (user exists, parameters valid)
 * - Delegating business rule validation to the ${className} aggregate
 * - Using the aggregate's markForDeletion() method for state transitions
 * - Ensuring proper event sourcing through repository patterns
 *
 * Business rules (handled by ${className} aggregate):
 * - User context validation
 * - Cannot delete default ${camelCase(className)}
 * - Domain event emission (${className}DeletedEvent)
 * - Aggregate state validation
 *
 * Technical responsibilities (handled here):
 * - User authentication validation
 * - Parameter validation
 * - Repository coordination
 * - Error handling and logging
 * - Exception translation
 */

@Injectable()
export class Delete${className}UseCase {
  private readonly logger = new Logger(Delete${className}UseCase.name);

  constructor(private readonly repository: ${className}Repository) {}

  /**
   * Executes the ${camelCase(className)} deletion with proper domain validation
   * Production-optimized with smart logging strategy
   * @param user - The user performing the deletion
   * @param code - The ${camelCase(className)} code to delete
   * @returns Promise<I${className}> - The deleted ${camelCase(className)} DTO
   * @throws NotFoundException - When ${camelCase(className)} is not found
   * @throws ${className}ExceptionMessage - When business rules prevent deletion
   */
  async execute(user: IUserToken, ${camelCase(key.name)}: ${key.type}): Promise<I${className}> {
    // Single operation start log with all context
    const operationContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      'Delete${className}UseCase',
      'execute',
      ${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
      user,
      {
        operation: 'DELETE',
        entityType: '${camelCase(className)}',
        phase: 'START',
        hasUser: !!user,
        hasCode: !!${camelCase(key.name)},
        userTenant: user?.tenant,
      },
    );

    this.logger.log(operationContext, \`Starting ${camelCase(className)} deletion: \${${camelCase(key.name)}}\`);

    try {
      // Input validation (no logging unless error)
      ${className}ValidationHelper.validateInput(user, ${camelCase(key.name)});

      // Fetch the aggregate
      const aggregate = await this.repository.getById(user, ${camelCase(key.name)});
      if (!aggregate) {
        throw new NotFoundException(${className}ExceptionMessage.notFound);
      }

      // Get domain events before deletion for tracking
      const eventsBeforeDeletion = aggregate.getUncommittedEvents().length;

      // Use aggregate method for deletion - this handles business rules and emits ${className}DeletedEvent
      aggregate.markForDeletion(user);

      // Track domain events emitted by deletion
      const eventsAfterDeletion = aggregate.getUncommittedEvents().length;
      const deletionEvents = eventsAfterDeletion - eventsBeforeDeletion;

      // Persist the deletion event and remove from repository
      await this.repository.delete(user, ${camelCase(key.name)});

      const deletedEntity = aggregate.toDto();

      // Single success log with comprehensive summary
      const successContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Delete${className}UseCase',
        'execute',
        ${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        user,
        {
          operation: 'DELETE',
          entityType: '${camelCase(className)}',
          phase: 'SUCCESS',
          deletedCode: deletedEntity.${camelCase(key.name)},
          eventsEmitted: deletionEvents,
        },
      );

      this.logger.log(
        successContext,
        \`Successfully deleted ${camelCase(className)}: \${${camelCase(key.name)}} [events: \${deletionEvents}]\`,
      );

      return deletedEntity;
    } catch (error) {
      // Single error log with context
      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        'Delete${className}UseCase',
        'execute',
        ${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        user,
        {
          operation: 'DELETE',
          entityType: '${camelCase(className)}',
          phase: 'ERROR',
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      );

      this.logger.error(errorContext, \`${className} deletion failed: \${${camelCase(key.name)}}\`);

      handleCommandError(
        error,
        ${className}ExceptionMessage.notFound,
        ${className}ExceptionMessage.deleteError,
      );
      throw error;
    }
  }
}
`);

    const deleteFileContent =
      buildImportLines(deleteImports) + '\n' + deleteUseCaseClass.join('\n');
    const deleteFilePath = path.join(
      outDir,
      fileBase,
      'application',
      'usecases',
      `delete-${fileBase}.usecase.ts`,
    );
    await writeFileWithDir(deleteFilePath, deleteFileContent);
    logger.success(`Created delete use case: ${deleteFilePath}`);
  }

  return errors;
};

const generateRelationshipArrayUseCases = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    if (schema.parameters?.[table.name]?.cancel?.update) {
      continue;
    }
    // Initialize errors object for this table
    errors[table.name] = {};

    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));

    // Create userRequiredForOperation error object
    errors[table.name]['userRequiredForOperation'] = {
      message: `User token is required to perform this operation on ${className}`,
      description: `Authentication is required to modify ${className} relationships`,
      code: `USER_REQUIRED_FOR_OPERATION_${table.name.toUpperCase()}`,
      exception: 'UnauthorizedException',
      statusCode: 401,
      domain: true,
    };

    const repositoryName = `${className}Repository`;
    const interfaceName = `I${className}`;
    const exceptionMsgName = `${className}ExceptionMessage`;
    const relImports = [];
    addImport(relImports, `@nestjs/common`, 'Injectable');
    addImport(relImports, `@nestjs/common`, 'NotFoundException');
    addImport(relImports, `@nestjs/common`, 'BadRequestException');
    addImport(relImports, `@nestjs/common`, 'Logger');
    addImport(
      relImports,
      `src/shared/application/commands`,
      'handleCommandError',
    );
    addImport(
      relImports,
      `src/shared/application/helpers`,
      'LoggingErrorHelper',
    );
    addImport(relImports, `../../infrastructure/repositories`, repositoryName);
    addImport(relImports, `src/shared/auth`, 'IUserToken');
    addImport(relImports, `../../domain/entities`, [interfaceName]);
    addImport(relImports, `../../domain/exceptions`, [
      exceptionMsgName,
      `${className}DomainException`,
    ]);
    addImport(relImports, `../helpers`, `${className}ValidationHelper`);

    await Promise.all(
      table._relationships.map(async (relation) => {
        // Only handle array/many relationships
        if (relation.c_p === 'many' && relation.c_ch === 'many') {
          const col = table.cols.find((col) => col.name === relation.childCol);
          if (!col) {
            logger.warn(
              `Skipping relation ${relation.childCol} in table ${table.name} - column not found`,
            );
            return;
          }
          const keys = table.cols.filter((col) => col.pk);
          if (keys.length === 0) {
            logger.warn(`Skipping table ${tableId} due to no primary key.`);
            return;
          }
          const childBase = upperFirst(
            camelCase(singularize(relation.childCol)),
          );
          const childKey = `${camelCase(childBase)}${upperFirst(camelCase(relation.parentCol))}`;

          if (col.datatype !== 'JSON') {
            const relName = upperFirst(
              camelCase(singularize(relation.childCol)),
            );
            // Add Use Case
            const addUseCaseClass = [
              `/**
 * Use case for adding ${camelCase(relName)} to ${camelCase(className)} with proper event sourcing.
 * Demonstrates proper use of aggregate methods for event emission.
 *
 * This implementation showcases:
 * - Proper separation of concerns between application and domain layers
 * - Direct use of aggregate methods for proper event emission
 * - Comprehensive error handling and audit logging
 * - Input validation and sanitization
 */`,
              `@Injectable()`,
              `export class Add${relName}To${className}UseCase {`,
              `  private readonly logger = new Logger(Add${relName}To${className}UseCase.name);`,
              ``,
              `  constructor(`,
              `    private readonly repository: ${repositoryName},`,
              `  ) {}`,
              ``,
              `  /**`,
              `   * Adds ${camelCase(singularize(relation.childCol))} to ${camelCase(table.name)} with proper domain validation`,
              `   * @param user - The user performing the operation`,
              `   * @param ${keys.map((key) => `${key.name} - The ${camelCase(table.name)} ${key.name} to add the ${camelCase(singularize(relation.childCol))} to`).join('\\n   * @param ')}`,
              `   * @param ${childKey} - The ${camelCase(singularize(relation.childCol))} ${relation.parentCol} to add`,
              `   * @returns Promise<${interfaceName}> - The updated ${camelCase(table.name)} DTO`,
              `   * @throws NotFoundException - When ${camelCase(table.name)} or ${camelCase(singularize(relation.childCol))} is not found`,
              `   * @throws ${className}DomainException - When business rules prevent the operation`,
              `   */`,
              `  async execute(user: IUserToken, ${keys.map((key) => `${key.name}: ${key.type},`).join(' ')} ${childKey}: ${col.type}): Promise<${interfaceName}> {`,
              `    try {`,
              `      // Input validation for technical concerns only
      ProductValidationHelper.validateInput(user, code);
      // Additional validation specific to ${camelCase(className)} operations`,

              ...(col.type === 'string'
                ? [
                    `    if (!${childKey} || typeof ${childKey} !== 'string' || ${childKey}.trim() === '') {`,
                    `      throw new BadRequestException(`,
                    `        ${className}ExceptionMessage.${childKey}CodeRequiredFor${upperFirst(childKey)}Operation,`,
                    `      );`,
                    `    }`,
                  ]
                : col.type === 'number'
                  ? [
                      `    if (!${childKey} || typeof ${childKey} !== 'number' || ${childKey} <= 0) {`,
                      `      throw new BadRequestException(`,
                      `        ${className}ExceptionMessage.${childKey}CodeRequiredFor${upperFirst(childKey)}Operation,`,
                      `      );`,
                      `    }`,
                    ]
                  : [
                      `    if (!${childKey}) {`,
                      `      throw new BadRequestException(`,
                      `        ${className}ExceptionMessage.${childKey}CodeRequiredFor${upperFirst(childKey)}Operation,`,
                      `      );`,
                      `    }`,
                    ]),
              ``,
              `      LoggingErrorHelper.logInfo(`,
              `        this.logger,`,
              `        \`Adding ${camelCase(singularize(relation.childCol))} \${${childKey}} to ${camelCase(table.name)} \${${keys[0].name}}\`,`,
              `        user,`,
              `        {`,
              `          ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `          ${childKey},`,
              `          operation: 'ADD_${snakeCase(relName).toUpperCase()}',`,
              `        },`,
              `      );`,
              ``,
              `      // Fetch the ${camelCase(table.name)} aggregate`,
              `      const aggregate = await this.repository.getById(user, ${keys.map((key) => `${key.name},`).join(' ')});`,
              `      if (!aggregate) {`,
              `        LoggingErrorHelper.logWarning(`,
              `          this.logger,`,
              `          \`${upperFirst(camelCase(table.name))} not found: \${${keys[0].name}}\`,`,
              `          user,`,
              `          {`,
              `            ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `            ${childKey},`,
              `          },`,
              `        );`,
              `        throw new NotFoundException(${exceptionMsgName}.notFound);`,
              `      }`,
              ``,
              `      // Fetch the related ${camelCase(singularize(relation.childCol))} entity`,
              `      const ${camelCase(singularize(relation.childCol))} = await this.repository.get${upperFirst(camelCase(relation.parentTable))}(user, ${childKey});`,
              `      if (!${camelCase(singularize(relation.childCol))}) {`,
              `        LoggingErrorHelper.logWarning(`,
              `          this.logger,`,
              `          \`${relName} not found: \${${childKey}}\`,`,
              `          user,`,
              `          {`,
              `            ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `            ${childKey},`,
              `          },`,
              `        );`,
              `        throw new BadRequestException(${className}ExceptionMessage.${camelCase(relation.childCol)}NotFound);`,
              `      }`,
              ``,
              `      // Use aggregate method for ${camelCase(relation.childCol)} addition - this emits ${className}${upperFirst(camelCase(relation.childCol))}AddedEvent
      aggregate.add${upperFirst(singularize(camelCase(relation.childCol)))}(user, ${singularize(camelCase(relation.childCol))});`,
              ``,
              `      // Save the updated aggregate`,
              `      const updated${className} = await this.repository.save${className}(user, aggregate);`,
              ``,
              `      LoggingErrorHelper.logSuccess(`,
              `        this.logger,`,
              `        \`Successfully added ${camelCase(singularize(relation.childCol))} \${${childKey}} to ${camelCase(table.name)} \${${keys[0].name}}\`,`,
              `        user,`,
              `        {`,
              `          ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `          ${childKey},`,
              `          operation: 'ADD_${snakeCase(relName).toUpperCase()}',`,
              `        },`,
              `      );`,
              ``,
              `      return updated${className};`,
              `    } catch (error) {`,
              `      LoggingErrorHelper.logError(`,
              `        this.logger,`,
              `        \`Failed to add ${camelCase(singularize(relation.childCol))} \${${childKey}} to ${camelCase(table.name)} \${${keys[0].name}}\`,`,
              `        user,`,
              `        error,`,
              `        {`,
              `          ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `          ${childKey},`,
              `          operation: 'ADD_${snakeCase(relName).toUpperCase()}',`,
              `        },`,
              `      );`,
              ``,
              `      // Handle domain-specific errors separately from infrastructure errors`,
              `      if (error instanceof ${className}DomainException) {`,
              `        throw error; // Re-throw domain exceptions as-is`,
              `      }`,
              ``,
              `      handleCommandError(`,
              `        error,`,
              `        ${className}ExceptionMessage.notFound,`,
              `        ${className}ExceptionMessage.updateError,`,
              `      );`,
              `      throw error;`,
              `    }`,
              `  }`,
              `}`,
              '',
            ];
            const addFileContent =
              buildImportLines(relImports) + '\n' + addUseCaseClass.join('\n');
            const addFilePath = path.join(
              outDir,
              fileBase,
              'application',
              'usecases',
              `add-${kebabCase(relName)}-to-${fileBase}.usecase.ts`,
            );
            await writeFileWithDir(addFilePath, addFileContent);
            // Remove Use Case
            const removeUseCaseClass = [
              `/**
 * Use case for removing ${camelCase(pluralize(relName))} from ${camelCase(className)} with proper event sourcing.
 * Demonstrates proper use of aggregate methods for event emission.
 *
 * This implementation showcases:
 * - Proper separation of concerns between application and domain layers
 * - Direct use of aggregate methods for proper event emission
 * - Comprehensive error handling and audit logging
 * - Input validation and sanitization
 * - Business rule enforcement through aggregate methods
 */`,
              `@Injectable()`,
              `export class Remove${relName}From${className}UseCase {`,
              `  private readonly logger = new Logger(Remove${relName}From${className}UseCase.name);`,
              ``,
              `  constructor(`,
              `    private readonly repository: ${repositoryName},`,
              `  ) {}`,
              ``,
              `  /**`,
              `   * Removes ${camelCase(singularize(relation.childCol))} from ${camelCase(table.name)} with proper domain validation`,
              `   * @param user - The user performing the operation`,
              `   * @param ${keys.map((key) => `${key.name} - The ${camelCase(table.name)} ${key.name} to remove the ${camelCase(singularize(relation.childCol))} from`).join('\\n   * @param ')}`,
              `   * @param ${childKey} - The ${camelCase(singularize(relation.childCol))} ${relation.parentCol} to remove`,
              `   * @returns Promise<${interfaceName}> - The updated ${camelCase(table.name)} DTO`,
              `   * @throws NotFoundException - When ${camelCase(table.name)} is not found`,
              `   * @throws ${className}DomainException - When business rules prevent the operation`,
              `   */`,
              `  async execute(user: IUserToken, ${keys.map((key) => `${key.name}: ${key.type},`).join(' ')} ${childKey}: ${col.type}): Promise<${interfaceName}> {`,
              `    try {`,
              `      // Input validation for technical concerns only
      ProductValidationHelper.validateInput(user, code);
      // Additional validation specific to ${camelCase(className)} operations`,

              ...(col.type === 'string'
                ? [
                    `    if (!${childKey} || typeof ${childKey} !== 'string' || ${childKey}.trim() === '') {`,
                    `      throw new BadRequestException(`,
                    `        ${className}ExceptionMessage.${childKey}CodeRequiredFor${upperFirst(childKey)}Operation,`,
                    `      );`,
                    `    }`,
                  ]
                : col.type === 'number'
                  ? [
                      `    if (!${childKey} || typeof ${childKey} !== 'number' || ${childKey} <= 0) {`,
                      `      throw new BadRequestException(`,
                      `        ${className}ExceptionMessage.${childKey}CodeRequiredFor${upperFirst(childKey)}Operation,`,
                      `      );`,
                      `    }`,
                    ]
                  : [
                      `    if (!${childKey}) {`,
                      `      throw new BadRequestException(`,
                      `        ${className}ExceptionMessage.${childKey}CodeRequiredFor${upperFirst(childKey)}Operation,`,
                      `      );`,
                      `    }`,
                    ]),
              ``,
              `      LoggingErrorHelper.logInfo(`,
              `        this.logger,`,
              `        \`Removing ${camelCase(singularize(relation.childCol))} \${${childKey}} from ${camelCase(table.name)} \${${keys[0].name}}\`,`,
              `        user,`,
              `        {`,
              `          ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `          ${childKey},`,
              `          operation: 'REMOVE_${snakeCase(relName).toUpperCase()}',`,
              `        },`,
              `      );`,
              ``,
              `      // Fetch the ${camelCase(table.name)} aggregate`,
              `      const aggregate = await this.repository.getById(user, ${keys.map((key) => `${key.name},`).join(' ')});`,
              `      if (!aggregate) {`,
              `        LoggingErrorHelper.logWarning(`,
              `          this.logger,`,
              `          \`${upperFirst(camelCase(table.name))} not found: \${${keys[0].name}}\`,`,
              `          user,`,
              `          {`,
              `            ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `            ${childKey},`,
              `          },`,
              `        );`,
              `        throw new NotFoundException(${exceptionMsgName}.notFound);`,
              `      }`,
              ``,
              `      // Use aggregate method for ${singularize(camelCase(relation.childCol))} removal - this emits ${className}${upperFirst(childKey)}RemovedEvent
      aggregate.remove${upperFirst(singularize(camelCase(relation.childCol)))}(user, ${childKey});`,
              ``,
              `      // Save the updated aggregate`,
              `      const updated${className} = await this.repository.save${className}(user, aggregate);`,
              ``,
              `      LoggingErrorHelper.logSuccess(`,
              `        this.logger,`,
              `        \`Successfully removed ${camelCase(singularize(relation.childCol))} \${${childKey}} from ${camelCase(table.name)} \${${keys[0].name}}\`,`,
              `        user,`,
              `        {`,
              `          ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `          ${childKey},`,
              `          operation: 'REMOVE_${snakeCase(relName).toUpperCase()}',`,
              `        },`,
              `      );`,
              ``,
              `      return updated${className};`,
              `    } catch (error) {`,
              `      LoggingErrorHelper.logError(`,
              `        this.logger,`,
              `        \`Failed to remove ${camelCase(singularize(relation.childCol))} \${${childKey}} from ${camelCase(table.name)} \${${keys[0].name}}\`,`,
              `        user,`,
              `        error,`,
              `        {`,
              `          ${camelCase(table.name)}${upperFirst(keys[0].name)}: ${keys[0].name},`,
              `          ${childKey},`,
              `          operation: 'REMOVE_${snakeCase(relName).toUpperCase()}',`,
              `        },`,
              `      );`,
              ``,
              `      // Handle domain-specific errors separately from infrastructure errors`,
              `      if (error instanceof ${className}DomainException) {`,
              `        throw error; // Re-throw domain exceptions as-is`,
              `      }`,
              ``,
              `      handleCommandError(`,
              `        error,`,
              `        ${className}ExceptionMessage.notFound,`,
              `        ${className}ExceptionMessage.updateError,`,
              `      );`,
              `      throw error;`,
              `    }`,
              `  }`,
              `}`,
              '',
            ];
            const removeFileContent =
              buildImportLines(relImports) +
              '\n' +
              removeUseCaseClass.join('\n');
            const removeFilePath = path.join(
              outDir,
              fileBase,
              'application',
              'usecases',
              `remove-${kebabCase(relName)}-from-${fileBase}.usecase.ts`,
            );
            await writeFileWithDir(removeFilePath, removeFileContent);
          }
        }
      }),
    );
  }

  return errors;
};

const generateRelationshipObjectUseCases = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    if (schema.parameters?.[table.name]?.cancel?.update) {
      continue;
    }
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const repositoryName = `${className}Repository`;
    const interfaceName = `I${className}`;
    const exceptionMsgName = `${className}ExceptionMessage`;
    const relImports = [];
    addImport(relImports, `@nestjs/common`, 'Injectable');
    addImport(relImports, `@nestjs/common`, 'NotFoundException');
    addImport(relImports, `@nestjs/common`, 'BadRequestException');
    addImport(
      relImports,
      `src/shared/application/commands`,
      'handleCommandError',
    );
    addImport(relImports, `../../infrastructure/repositories`, repositoryName);
    addImport(relImports, `src/shared/auth`, 'IUserToken');
    addImport(relImports, `../../domain/entities`, [interfaceName]);
    addImport(relImports, `../../domain/exceptions`, [exceptionMsgName]);
    await Promise.all(
      table._relationships.map(async (relation) => {
        // Only handle object/one relationships
        if (
          relation.c_p === 'one' &&
          relation.c_ch === 'many' &&
          relation.childCol
        ) {
          const col = table.cols.find((col) => col.name === relation.childCol);
          if (!col) {
            logger.warn(
              `Skipping relation ${relation.childCol} in table ${table.name} - column not found`,
            );
            return;
          }
          if (col.datatype !== 'JSON') {
            const relName = upperFirst(
              camelCase(singularize(relation.childCol)),
            );
            // Update Use Case
            const updateUseCaseClass = [
              `@Injectable()`,
              `export class Update${className}${relName}UseCase {`,
              `  constructor(private readonly repository: ${repositoryName}) {}`,
              ``,
              `  async execute(user: IUserToken, id: string, relId: string): Promise<${interfaceName}> {`,
              `    try {`,
              `      const aggregate = await this.repository.getById(user, id);`,
              `      if (!aggregate) {`,
              `        throw new NotFoundException(${exceptionMsgName}.notFound);`,
              `      }`,
              `      const related = await this.repository.get${upperFirst(camelCase(relation.parentTable))}(user, relId);`,
              `      if (!related) {`,
              `        throw new BadRequestException(${className}ExceptionMessage.${camelCase(relation.childCol)}NotFound);`,
              `      }`,
              `      aggregate.update${relName}(user, related);`,
              `      return await this.repository.save${className}(user, aggregate);`,
              `    } catch (error) {`,
              `      handleCommandError(error, ${className}ExceptionMessage.notFound, ${className}ExceptionMessage.updateError);`,
              `      throw error;`,
              `    }`,
              `  }`,
              `}`,
              '',
            ];
            const updateFileContent =
              buildImportLines(relImports) +
              '\n' +
              updateUseCaseClass.join('\n');
            const updateFilePath = path.join(
              outDir,
              fileBase,
              'application',
              'usecases',
              `update-${fileBase}-${kebabCase(relName)}.usecase.ts`,
            );
            await writeFileWithDir(updateFilePath, updateFileContent);
          }
        }
      }),
    );
  }
};
// --- API USE CASES (Custom UseCases for each API) ---
const generateApiUseCases = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const repositoryName = `${className}Repository`;
    const interfaceName = `I${className}`;
    const apis = schema.parameters[table.name]?.apis || {};
    for (const [apiId, api] of Object.entries(apis)) {
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );
      const useCaseClass = `${className}${upperFirst(methodName)}UseCase`;
      const paramMatches = [...apiId.matchAll(/:([a-zA-Z0-9_]+)/g)];
      const paramNames = paramMatches.map((m) => m[1]);
      const paramTypes = paramNames.map((p) =>
        api.params?.[p]?.type === 'number' ? 'number' : 'string',
      );
      // Imports for API use case
      const apiImports = [];
      addImport(apiImports, `@nestjs/common`, 'Injectable');
      addImport(
        apiImports,
        `../../infrastructure/repositories`,
        repositoryName,
      );
      addImport(apiImports, `src/shared/auth`, 'IUserToken');
      addImport(apiImports, `../../domain/aggregates`, [className]);
      addImport(apiImports, `../../domain/entities`, [interfaceName]);
      // UseCase class
      const apiUseCaseClass = [];
      apiUseCaseClass.push(`@Injectable()`);
      apiUseCaseClass.push(`export class ${useCaseClass} {`);
      apiUseCaseClass.push(
        `  constructor(private readonly repository: ${repositoryName}) {}`,
      );
      apiUseCaseClass.push('');
      apiUseCaseClass.push(
        `  async execute(user: IUserToken${paramNames.length ? ', ' + paramNames.map((p, i) => `${p}: ${paramTypes[i]}`).join(', ') : ''}): Promise<${interfaceName}> {`,
      );
      apiUseCaseClass.push(
        `    // TODO: Implement domain logic for ${methodName}`,
      );
      apiUseCaseClass.push(
        `    // Example: fetch aggregate, call method, persist, return`,
      );
      apiUseCaseClass.push(
        `    // const aggregate = await this.repository.getById(user, ${paramNames.length ? paramNames[0] : 'undefined'}); // Adjust as needed`,
      );
      apiUseCaseClass.push(
        `    // aggregate.${methodName}(user${paramNames.length ? ', ' + paramNames.join(', ') : ''});`,
      );
      apiUseCaseClass.push(
        `    // return await this.repository.save${className}(user, aggregate);`,
      );
      apiUseCaseClass.push(`    throw new Error('Not implemented');`);
      apiUseCaseClass.push(`  }`);
      apiUseCaseClass.push(`}`);
      apiUseCaseClass.push('');
      // Write the use case file
      const apiUseCaseFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'usecases',
        `${fileBase}-${kebabCase(methodName)}.usecase.ts`,
      );
      await writeFileWithDir(
        apiUseCaseFilePath,
        buildImportLines(apiImports) + '\n' + apiUseCaseClass.join('\n'),
      );
    }
  }
};

const generateEnableDisableUseCases = async (schema) => {
  // --- ENABLE/DISABLE USE CASES ---
  const moduleName = upperFirst(camelCase(schema.service.module));
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'enabled')
    ) {
      const keys = table.cols.filter((col) => col.pk);
      if (keys.length !== 1) {
        continue;
      }
      const key = keys[0];
      const fileBase = kebabCase(table.name);
      const className = upperFirst(camelCase(table.name));
      const repositoryName = `${className}Repository`;
      const interfaceName = `I${className}`;
      const exceptionMsgName = `${className}ExceptionMessage`;
      // Enable UseCase
      const enableUseCaseImports = [];
      addImport(enableUseCaseImports, `@nestjs/common`, [
        'Injectable',
        'NotFoundException',
        'Logger',
      ]);
      addImport(
        enableUseCaseImports,
        `src/shared/application/commands`,
        'handleCommandError',
      );

      addImport(
        enableUseCaseImports,
        `../../infrastructure/repositories`,
        repositoryName,
      );
      addImport(enableUseCaseImports, `src/shared/auth`, 'IUserToken');
      addImport(enableUseCaseImports, `../../domain/entities`, [interfaceName]);
      addImport(enableUseCaseImports, `../../domain/exceptions`, [
        exceptionMsgName,
      ]);
      addImport(enableUseCaseImports, `src/shared/application/helpers`, [
        'LoggingErrorHelper',
      ]);
      addImport(enableUseCaseImports, `../helpers`, [
        `${className}ValidationHelper`,
      ]);
      const enableUseCaseClass = [
        `/**
 * Use case for enabling ${camelCase(className)} entities with proper event sourcing.
 * Demonstrates proper use of aggregate methods for event emission.
 *
 * This implementation showcases:
 * - Proper separation of concerns between application and domain layers
 * - Direct use of aggregate methods for proper event emission
 * - Input validation at the application layer
 * - Comprehensive error handling and audit logging
 */`,
        `@Injectable()`,
        `export class Enable${className}UseCase {`,
        `  private readonly logger = new Logger(Enable${className}UseCase.name);`,
        ``,
        `  constructor(private readonly repository: ${repositoryName}) {}`,
        ``,
        `  async execute(user: IUserToken, ${camelCase(key.name)}: ${key.type}): Promise<${interfaceName}> {`,
        `    try {`,
        `      // Input validation for technical concerns only
      ${className}ValidationHelper.validateInput(user, ${camelCase(key.name)});

      LoggingErrorHelper.logInfo(
        this.logger,
        \`Enabling ${camelCase(className)}: \${${camelCase(key.name)}}\`,
        user,
      );
`,
        `      const aggregate = await this.repository.getById(user, ${camelCase(key.name)});`,
        `      if (!aggregate) {`,
        `        throw new NotFoundException(${className}ExceptionMessage.notFound);
      }`,
        `      // Use aggregate method for enabling - this emits Enable${className}dEvent
    aggregate.enable(user);

    const result = await this.repository.save${className}(user, aggregate);

    LoggingErrorHelper.logInfo(
      this.logger,
      \`Successfully processed ${camelCase(className)} enable: \${${camelCase(key.name)}}\`,
      user,
      {
        ${camelCase(key.name)},
         operation: 'ENABLE',
         entityType: '${camelCase(className)}',
       },
     );

    return result;`,
        `    } catch (error) {`,
        `      LoggingErrorHelper.logError(
        this.logger,
        \`Failed to enable ${camelCase(className)}: \${${camelCase(key.name)}}\`,
        user,
        error,
        {
          ${camelCase(key.name)},
          operation: 'ENABLE',
          entityType: '${camelCase(className)}',
        },
      );
`,
        `      handleCommandError(`,
        `        error,`,
        `        ${className}ExceptionMessage.notFound,`,
        `        ${className}ExceptionMessage.updateError,`,
        `      );`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const enableFileContent =
        buildImportLines(enableUseCaseImports) +
        '\n' +
        enableUseCaseClass.join('\n');
      const enableFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'usecases',
        `enable-${fileBase}.usecase.ts`,
      );
      await writeFileWithDir(enableFilePath, enableFileContent);

      // Disable UseCase
      const disableUseCaseImports = [];
      addImport(disableUseCaseImports, `@nestjs/common`, [
        'Injectable',
        'NotFoundException',
        'Logger',
      ]);

      addImport(
        disableUseCaseImports,
        `../../infrastructure/repositories`,
        repositoryName,
      );
      addImport(disableUseCaseImports, `src/shared/auth`, 'IUserToken');
      addImport(disableUseCaseImports, `../../domain/entities`, [
        interfaceName,
      ]);
      addImport(disableUseCaseImports, `../../domain/exceptions`, [
        exceptionMsgName,
      ]);
      addImport(disableUseCaseImports, `src/shared/application/helpers`, [
        'LoggingErrorHelper',
      ]);
      addImport(disableUseCaseImports, `../helpers`, [
        `${className}ValidationHelper`,
      ]);
      const disableUseCaseClass = [
        `/**
 * Use case for disabling ${pluralize(className)} in the system
 *
 * This use case implements Domain-Driven Design principles by:
 * - Handling only technical validation (user exists, parameters valid)
 * - Delegating business rule validation to the ${className} aggregate
 * - Using the aggregate's disable() method for state transitions
 * - Ensuring proper event sourcing through repository patterns
 *
 * Business rules (handled by ${className} aggregate):
 * - User context validation
 * - Idempotent disable operations (already disabled check)
 * - Domain event emission (${className}DisabledEvent)
 * - Aggregate state validation
 *
 * Technical responsibilities (handled here):
 * - User authentication validation
 * - Parameter validation
 * - Repository coordination
 * - Error handling and logging
 * - Exception translation
 */
`,
        `@Injectable()`,
        `export class Disable${className}UseCase {`,
        `  private readonly logger = new Logger(Disable${className}UseCase.name);
`,
        `  constructor(private readonly repository: ${repositoryName}) {}`,
        ``,
        `  /**
   * Disables a ${camelCase(className)} identified by ${camelCase(key.name)}
   * @param user - User performing the operation
   * @param ${camelCase(key.name)} - Unique identifier of the ${camelCase(className)} to disable
   * @returns Promise<I${className}> - The disabled ${camelCase(className)} data
   * @throws BadRequestException - When validation fails
   * @throws NotFoundException - When ${camelCase(className)} is not found
   */`,
        `  async execute(user: IUserToken, ${camelCase(key.name)}: ${key.type}): Promise<${interfaceName}> {`,
        `    try {`,
        `      // Input validation for technical concerns only
      ${className}ValidationHelper.validateInput(user, ${camelCase(key.name)});
      LoggingErrorHelper.logInfo(
        this.logger,
        \`Disabling ${camelCase(className)}: \${${camelCase(key.name)}}\`,
        user,
      );`,
        ``,
        `      const aggregate = await this.repository.getById(user, ${camelCase(key.name)});`,
        ``,
        `      if (!aggregate) {
        LoggingErrorHelper.logWarning(
          this.logger,
          \`${className} not found: \${${camelCase(key.name)}}\`,
          user,
        );
        throw new NotFoundException(${className}ExceptionMessage.notFound);
      }

      // Use aggregate method for business logic and event emission
      aggregate.disable(user);
      const savedAggregate = await this.repository.save${className}(user, aggregate);

      LoggingErrorHelper.logInfo(
        this.logger,
        \`Successfully processed ${camelCase(className)} disable: \${${camelCase(key.name)}}\`,
        user,
        {
          ${camelCase(key.name)},
          operation: 'DISABLE',
          entityType: '${camelCase(className)}',
        },
      );

      return savedAggregate;

    } catch (error) {
      LoggingErrorHelper.logError(
        this.logger,
        \`Failed to disable ${camelCase(className)}: \${${camelCase(key.name)}}\`,
        user,
        error,
        {
          ${camelCase(key.name)},
          operation: 'DISABLE',
          entityType: '${camelCase(className)}',
        },
      );

      throw error;
    }
  }`,
        `}`,
        '',
      ];
      const disableFileContent =
        buildImportLines(disableUseCaseImports) +
        '\n' +
        disableUseCaseClass.join('\n');
      const disableFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'usecases',
        `disable-${fileBase}.usecase.ts`,
      );
      await writeFileWithDir(disableFilePath, disableFileContent);
    }
  }
};

const generateUpdateStatusUseCases = async (schema) => {
  // --- STATUS USE CASES ---
  const moduleName = upperFirst(camelCase(schema.service.module));
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'status' && col.datatype === 'ENUM')
    ) {
      const keys = table.cols.filter((col) => col.pk);
      if (keys.length !== 1) {
        continue;
      }

      const key = keys[0];
      const fileBase = kebabCase(table.name);
      const className = upperFirst(camelCase(table.name));
      const repositoryName = `${className}Repository`;
      const interfaceName = `I${className}`;
      const exceptionMsgName = `${className}ExceptionMessage`;
      // Status UseCase
      const statusUseCaseImports = [];

      addImport(statusUseCaseImports, `@nestjs/common`, [
        'Injectable',
        'NotFoundException',
        'BadRequestException',
        'Logger',
      ]);
      addImport(
        statusUseCaseImports,
        `src/shared/application/commands`,
        'handleCommandError',
      );

      addImport(
        statusUseCaseImports,
        `../../infrastructure/repositories`,
        repositoryName,
      );
      addImport(statusUseCaseImports, `src/shared/auth`, 'IUserToken');
      addImport(statusUseCaseImports, `../../domain/entities`, [interfaceName]);
      addImport(statusUseCaseImports, `../../domain/exceptions`, [
        exceptionMsgName,
      ]);
      addImport(statusUseCaseImports, `src/shared/application/helpers`, [
        'LoggingErrorHelper',
      ]);

      addImport(statusUseCaseImports, `../../domain/entities`, [
        `${className}StatusEnum`,
      ]);

      addImport(statusUseCaseImports, `../helpers`, [
        `${className}ValidationHelper`,
      ]);
      const statusUseCaseClass = [
        `/**
 * Use case for updating ${camelCase(className)} status with proper event sourcing.
 * Demonstrates proper use of aggregate methods for event emission.
 *
 * This implementation showcases:
 * - Proper separation of concerns between application and domain layers
 * - Direct use of aggregate methods for proper event emission
 * - Input validation at the application layer
 * - Comprehensive error handling and audit logging
 */
`,
        `@Injectable()`,
        ``,
        `export class Update${className}StatusUseCase {
`,
        `  private readonly logger = new Logger(Update${className}StatusUseCase.name);
`,
        `  constructor(private readonly repository: ${repositoryName}) {}`,

        `  async execute(user: IUserToken, ${camelCase(key.name)}: ${key.type}, status: ${className}StatusEnum): Promise<${interfaceName}> {`,
        `    try {`,
        `      // Technical validation only (null checks, types) - NO business rules
      ${className}ValidationHelper.validateInput(user, ${camelCase(key.name)});

      if (!status) {
        throw new NotFoundException(${className}ExceptionMessage.statusNotFound);
      }

      LoggingErrorHelper.logInfo(
        this.logger,
        \`Updating ${camelCase(className)} status: \${${camelCase(key.name)}} to \${status}\`,
        user,
      );
`,
        `      const aggregate = await this.repository.getById(user, ${camelCase(key.name)});`,
        `      if (!aggregate) {
        throw new NotFoundException(${className}ExceptionMessage.notFound);
      }
`,
        `
      // Always call aggregate method - it handles ALL business logic including idempotent updates
      aggregate.updateStatus(user, status);

      const result = await this.repository.save${className}(user, aggregate);

      LoggingErrorHelper.logInfo(
        this.logger,
        \`Successfully processed ${camelCase(className)} status update: \${${camelCase(key.name)}}\`,
        user,
        {
          ${camelCase(key.name)},
          status,
          operation: 'UPDATE_STATUS',
          entityType: '${camelCase(className)}',
        },
      );

      return result;
    } catch (error) {
      LoggingErrorHelper.logError(
        this.logger,
        \`Failed to update ${camelCase(className)} status: \${${camelCase(key.name)}}\`,
        user,
        error,
        {
          ${camelCase(key.name)},
          status,
          operation: 'UPDATE_STATUS',
          entityType: '${camelCase(className)}',
        },
      );

      handleCommandError(
        error,
        ${className}ExceptionMessage.notFound,
        ${className}ExceptionMessage.updateError,
      );
      throw error;
    }
  }
}
`,
      ];
      const statusFileContent =
        buildImportLines(statusUseCaseImports) +
        '\n' +
        statusUseCaseClass.join('\n');
      const statusFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'usecases',
        `update-${fileBase}-status.usecase.ts`,
      );
      await writeFileWithDir(statusFilePath, statusFileContent);
    }
  }
};

const generateValidationHelper = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    errors[table.name] = {};
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));

    // --- CREATE USE CASE IMPORTS ---
    const createImports = [];

    addImport(createImports, `@nestjs/common`, 'UnauthorizedException');
    addImport(createImports, `@nestjs/common`, 'BadRequestException');
    addImport(createImports, `src/shared/auth`, 'IUserToken');

    addImport(
      createImports,
      `../../domain/exceptions`,
      `${className}ExceptionMessage`,
    );
    const exceptionMsgName = `${className}ExceptionMessage`;

    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }

    const key = keys[0];
    // Build the use case class with enhanced pattern
    const createUseCaseClass = [
      `/**`,
      ` * Shared validation helper for ${className} domain use cases.`,
      ` * Handles ONLY pure technical validation (null checks, type validation, format validation).`,
      ` * Business rules like "valid status values" or "valid property structures" are enforced by domain aggregates.`,
      ` */`,
      `export class ${className}ValidationHelper {`,
      `  static validateInput(user: IUserToken, ${camelCase(key.name)}: ${key.type}): void {`,
      `    if (!user) {`,
      `      throw new UnauthorizedException(${exceptionMsgName}.${className}UserRequired);`,
      `    }`,
      ``,
      `    if (!${camelCase(key.name)} || typeof ${camelCase(key.name)} !== '${key.type}' || ${key.type === 'string' ? `${camelCase(key.name)}.trim() === ''` : `${camelCase(key.name)} <= 0`}) {`,
      `      throw new BadRequestException(${exceptionMsgName}.${camelCase(key.name)}Required${className});`,
      `    }`,
      ``,
      `  // Note: Business rules like "${camelCase(className)} exists" and "idempotent enable/disable logic"`,
      `  // are enforced by the ${className} aggregate's enable() / disable() method`,
      `  }`,
      `}`,
      '',
    ];

    // Define error messages for better error handling
    errors[table.name][`${className}UserRequired`] = {
      message: `User token is required for this operation on ${table.name}`,
      description: `This error occurs when a user tries to perform an operation on ${table.name} without providing a valid user token.`,
      code: `USER_REQUIRED_FOR_OPERATION_${table.name.toUpperCase()}`,
      exception: 'UnauthorizedException',
      domain: true,
      statusCode: 401,
    };

    errors[table.name][`${camelCase(key.name)}Required${className}`] = {
      message: `Valid ${camelCase(key.name)} is required for this operation on ${table.name}`,
      description: `This error occurs when a user tries to perform an operation on ${table.name} without providing a valid ${camelCase(key.name)}.`,
      code: `${snakeCase(key.name).toUpperCase()}_REQUIRED_FOR_OPERATION_${table.name.toUpperCase()}`,
      exception: 'BadRequestException',
      domain: true,
      statusCode: 400,
    };

    // Write the use case files
    const createFileContent =
      buildImportLines(createImports) + '\n' + createUseCaseClass.join('\n');
    const createFilePath = path.join(
      outDir,
      fileBase,
      'application',
      'helpers',
      `${fileBase}-validation.helper.ts`,
    );

    await writeFileWithDir(createFilePath, createFileContent);

    const indexPath = path.join(outDir, fileBase, 'application', 'helpers');
    createIndexFilesFromDirectory(indexPath);
  }

  return errors;
};

const addIndexTs = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }

    if (
      schema.parameters?.[table.name]?.cancel?.delete &&
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }

    const fileBase = kebabCase(table.name);
    const indexPath = path.join(outDir, fileBase, 'application', 'usecases');
    createIndexFilesFromDirectory(indexPath);
  }
};

const generateCommandsBarrelIndex = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.datatype === 'JSON' && col.pk)) continue;
    if (
      schema.parameters?.[table.name]?.cancel?.delete &&
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      Object.keys(schema.parameters?.[table.name]?.apis || {}).length === 0
    ) {
      continue;
    }
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    // Collect handler imports and command exports
    const usecaseImports = [];
    const usecaseArr = [];
    // Standard handlers
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      usecaseImports.push(
        `import { Create${className}UseCase } from './create-${fileBase}.usecase';`,
      );
      usecaseArr.push(`Create${className}UseCase`);
    }
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      usecaseImports.push(
        `import { Update${className}UseCase } from './update-${fileBase}.usecase';`,
      );
      usecaseArr.push(`Update${className}UseCase`);
    }
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      usecaseImports.push(
        `import { Delete${className}UseCase } from './delete-${fileBase}.usecase';`,
      );
      usecaseArr.push(`Delete${className}UseCase`);
    }

    // Relationship handlers
    if (Array.isArray(table._relationships)) {
      for (const rel of table._relationships) {
        const col = table.cols.find((c) => c.name === rel.childCol);
        if (!col || col.datatype === 'JSON') continue;
        const relName = upperFirst(camelCase(singularize(rel.childCol)));
        const relFileName = kebabCase(relName);
        if (schema.parameters?.[table.name]?.cancel?.update) {
          continue;
        }
        // Arrays: add/remove, Objects: update
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          usecaseImports.push(
            `import { Add${relName}To${className}UseCase } from './add-${relFileName}-to-${fileBase}.usecase';`,
          );
          usecaseImports.push(
            `import { Remove${relName}From${className}UseCase } from './remove-${relFileName}-from-${fileBase}.usecase';`,
          );
          usecaseArr.push(`Add${relName}To${className}UseCase`);
          usecaseArr.push(`Remove${relName}From${className}UseCase`);
        } else if (rel.c_p === 'one' && rel.c_ch === 'many') {
          usecaseImports.push(
            `import {Update${className}${relName}UseCase } from './update-${fileBase}-${relFileName}.usecase';`,
          );
          usecaseArr.push(`Update${className}${relName}UseCase`);
        }
      }
    }
    // --- API USE CASES (Custom UseCases for each API) ---
    const apis = schema.parameters[table.name]?.apis || {};
    for (const [apiId, api] of Object.entries(apis)) {
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );
      const useCaseClass = `${className}${upperFirst(methodName)}UseCase`;
      usecaseImports.push(
        `import { ${useCaseClass} } from './${fileBase}-${kebabCase(methodName)}.usecase';`,
      );
      usecaseArr.push(`${useCaseClass}`);
    }
    // Enable/Disable usecases
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'enabled')
    ) {
      usecaseImports.push(
        `import { Enable${className}UseCase } from './enable-${fileBase}.usecase';`,
      );
      usecaseImports.push(
        `import { Disable${className}UseCase } from './disable-${fileBase}.usecase';`,
      );
      usecaseArr.push(`Enable${className}UseCase`);
      usecaseArr.push(`Disable${className}UseCase`);
    }
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'status' && col.datatype === 'ENUM')
    ) {
      usecaseImports.push(
        `import { Update${className}StatusUseCase } from './update-${fileBase}-status.usecase';`,
      );
      usecaseArr.push(`Update${className}StatusUseCase`);
    }
    // Compose the index.ts
    const lines = [];
    lines.push(...usecaseImports);
    lines.push('');
    lines.push('// application/commands/index.ts');
    lines.push(`export const ${className}UseCases = [`);
    lines.push('  ' + usecaseArr.join(',\n  ') + ',');
    lines.push('];\n');
    lines.push('');
    lines.push('export {');
    lines.push('  ' + usecaseArr.join(',\n  ') + ',');
    lines.push('};');
    lines.push('');
    // Write the index.ts
    const indexPath = path.join(
      outDir,
      fileBase,
      'application',
      'usecases',
      'index.ts',
    );
    await writeFileWithDir(indexPath, lines.join('\n'), true);
  }
};

// Add to main create
module.exports.create = async (schema) => {
  errors = {};

  await handleStep('create', generateCreateUseCases, errors);
  await handleStep('update', generateUpdateUseCases, errors);
  await handleStep('delete', generateDeleteUseCases, errors);
  await handleStep(
    'relationshipArray',
    generateRelationshipArrayUseCases,
    errors,
  );
  await handleStep(
    'relationshipObject',
    generateRelationshipObjectUseCases,
    errors,
  );
  await handleStep('api', generateApiUseCases, errors);
  await handleStep('enableDisable', generateEnableDisableUseCases, errors);
  await handleStep('updateStatus', generateUpdateStatusUseCases, errors);
  await handleStep('commandsBarrelIndex', generateCommandsBarrelIndex, errors);
  await handleStep('validationHelper', generateValidationHelper, errors);
  await addIndexTs(schema);
  return errors;
};
