const path = require('path');
const { writeFileWithDir } = require('../utils/file-utils');
const { shouldSkipTable } = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  singularize,
  pluralize,
  sentenceCase,
  snakeCase,
} = require('../utils/word-utils');
const { logger } = require('../utils/general-utils');

const { getComplexObjects } = require('./utils/model-utils');

// Helper function to add imports to the imports object
function addImport(imports, path, items) {
  if (!imports[path]) {
    imports[path] = new Set();
  }
  if (Array.isArray(items)) {
    items.forEach((item) => imports[path].add(item));
  } else {
    imports[path].add(items);
  }
}

/**
 * Generates domain service files for complex business operations
 * Following the pattern of ${className}DomainService
 */
const create = async (schema) => {
  const errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);

  for (const [tableId, table] of Object.entries(tables)) {
    errors[table.name] = {};
    // Skip tables that don't need domain services or are excluded
    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }

    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }

    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const serviceName = `${className}DomainService`;

    // Create field-specific error objects for complex objects and relationships
    table.cols
      .filter((col) => col.nn && col.datatype === 'JSON')
      .forEach((col) => {
        const fieldName = camelCase(col.name);

        errors[table.name][`${fieldName}OneRequired`] = {
          message: `At least one ${sentenceCase(col.name)} is required`,
          description: `Business rule: ${className} must have at least one ${sentenceCase(col.name)} associated`,
          code: `${col.name.toUpperCase()}_ONE_REQUIRED_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };

        errors[table.name][`${fieldName}NotFound`] = {
          message: `${sentenceCase(col.name)} not found`,
          description: `The specified ${sentenceCase(col.name)} does not exist or is not accessible`,
          code: `${col.name.toUpperCase()}_NOT_FOUND_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 404,
          domain: true,
        };

        errors[table.name][`${fieldName}Required`] = {
          message: `${sentenceCase(col.name)} is required`,
          description: `${sentenceCase(col.name)} must be provided for ${className} operations`,
          code: `${col.name.toUpperCase()}_REQUIRED_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };
      });

    const key = table.cols.find((col) => col.pk && col.datatype !== 'JSON');
    if (!key) {
      continue;
    }

    // Create relationship-specific error objects
    const tableRelationships = table._relationships || [];
    tableRelationships.forEach((relation) => {
      const col = table.cols.find((c) => c.name === relation.childCol);
      if (col) {
        const fieldName = camelCase(col.name);
        const entityName = relation.parentClass;

        if (!errors[table.name][`${fieldName}NotFound`]) {
          errors[table.name][`${fieldName}NotFound`] = {
            message: `${sentenceCase(entityName)} not found`,
            description: `The specified ${sentenceCase(entityName)} does not exist or is not accessible`,
            code: `${col.name.toUpperCase()}_NOT_FOUND_${table.name.toUpperCase()}`,
            exception: `${className}DomainException`,
            statusCode: 404,
            domain: true,
          };
        }

        if (col.nn && relation.c_p === 'many' && relation.c_ch === 'many') {
          if (col.defaultvalue === 'object()') {
            errors[table.name][`${fieldName}Required`] = {
              message: `${sentenceCase(col.name)} is required`,
              description: `${sentenceCase(col.name)} must be provided for ${className} operations`,
              code: `${col.name.toUpperCase()}_REQUIRED_${table.name.toUpperCase()}`,
              exception: `${className}DomainException`,
              statusCode: 400,
              domain: true,
            };
          } else {
            errors[table.name][`${fieldName}OneRequired`] = {
              message: `At least one ${sentenceCase(entityName)} is required`,
              description: `Business rule: ${className} must have at least one ${sentenceCase(entityName)} associated`,
              code: `${col.name.toUpperCase()}_ONE_REQUIRED_${table.name.toUpperCase()}`,
              exception: `${className}DomainException`,
              statusCode: 400,
              domain: true,
            };
          }
        }
      }
    });

    const imports = {};
    const lines = [];

    const entityPath = path.join(outDir, fileBase, 'domain');

    const complexObjects = getComplexObjects(schema, table);
    complexObjects.forEach((obj) => {
      console.log(
        `Processing column: in table ${table.name}`,
        obj.tableName,
        obj.type,
      );
    });

    // Add core imports
    addImport(imports, '@nestjs/common', ['Injectable']);
    if (complexObjects.length) {
      addImport(imports, '@nestjs/common', ['Logger']);
    }
    addImport(imports, 'src/shared/auth', 'IUserToken');
    if (key.defaultvalue === 'uuid()') {
      addImport(imports, 'crypto', `randomUUID`);
    }
    const entityType = className;

    addImport(imports, '../aggregates', className);

    // Check if create/update properties exist
    const createModelPath = path.join(
      entityPath,
      'properties',
      `${fileBase}-create.model.ts`,
    );
    const updateModelPath = path.join(
      entityPath,
      'properties',
      `${fileBase}-update.model.ts`,
    );
    const propertyImports = [];

    if (!schema.parameters?.[table.name]?.cancel?.create) {
      propertyImports.push(`Create${className}Props`);
    }
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      propertyImports.push(`Update${className}Props`);
    }
    if (propertyImports.length > 0) {
      addImport(imports, '../properties', propertyImports);
    }

    if (complexObjects.length) {
      addImport(imports, '../exceptions', [
        `${className}DomainException`,
        `${className}ExceptionMessage`,
      ]);
    }
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      addImport(imports, '../value-objects', `${className}Identifier`);
    }
    // Add imports for related entities based on relationships
    const relationships = table._relationships || [];

    // Generate service class
    lines.push(`/**
 * Domain service for handling complex business operations that span multiple aggregates
 * or require complex coordination. This service contains business logic that doesn't
 * naturally fit within a single aggregate.
 *
 * Key responsibilities:
 * - Complex entity creation involving multiple related entities
 * - Business operations requiring coordination across aggregates
 * - Complex validation that involves external entity dependencies
 * - Business rules that span multiple bounded contexts
 */`);

    lines.push('@Injectable()');
    lines.push(`export class ${serviceName} {`);

    if (complexObjects.length) {
      lines.push(`  private readonly logger = new Logger(${className}DomainService.name);

  /**
   * TODO TRACKING - Unimplemented Business Rules
   *
   * The following business rules are not yet implemented and will log warnings:
   *
   * 1. validateEntityCombinations:
   *    - Relationship compatibility validation
   *
   * 2. validate${className}UpdateBusinessRules:
   *    - Category change validation for active ${camelCase(pluralize(className))}
   *
   * 3. validateRelationshipCompatibility:
   *    - Active transaction checking before relationship changes
   *    - Relationship support validation
   *    - Relationship conversion capability checking
   *
   * 4. validateObjectCompatibility:
   *    - Active operation object structure checking
   *    - Regulatory requirement validation
   *    - Category-object structure compatibility
   *
   * 5. validateConfigurationCompatibility:
   *    - Object compatibility validation
   *    - Object configuration alignment
   *
   * 6. initiate${className}Deletion:
   *    - Active ${camelCase(className)} dependency checking
   *    - External dependency coordination
   *
   * All unimplemented rules include appropriate logging to prevent silent failures.
   */`);
    } else {
      lines.push(`  /**
   * TODO TRACKING - Simplified Domain Service Approach
   *
   * ${className} is a simple entity with basic properties (code, name, description, active)
   * and no cross-aggregate dependencies. Unlike Product or Rail domain services which
   * manage complex relationships and external dependencies, ${className} domain service
   * focuses on orchestration without complex validation:
   *
   * 1. Entity Creation: Simple aggregate creation with basic validation
   * 2. Update Coordination: Direct delegation to aggregate methods
   * 3. Deletion Orchestration: Simple delegation to aggregate deletion
   *
   * Complex business rules are handled by the aggregate itself via validateState().
   * This follows DDD principles - domain services only when business logic spans aggregates.
   */`);
    }
    lines.push(`/**
   * Creates a new ${className} aggregate with complex entity resolution and coordination.
   * This method handles the orchestration of fetching related entities and ensuring
   * all dependencies are properly resolved before creating the aggregate.
   */`);
    // Generate createEntity method (only if create interface exists)
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      lines.push(`  async create${className}(`);
      lines.push(`    user: IUserToken,`);
      lines.push(`    createData: Create${className}Props,`);
      if (complexObjects.length) {
        lines.push(`    entityFetcher: {`);
        for (const obj of complexObjects) {
          switch (obj.type) {
            case 'recordset':
              lines.push(
                `      get${upperFirst(camelCase(obj.col.name))}: (user: IUserToken, ${camelCase(obj.col.name)}: Record<string, Create${upperFirst(camelCase(obj.tableName))}Props>) => Promise<Record<string, I${obj.rel.parentClass}>>;`,
              );
              addImport(
                imports,
                `../../../${kebabCase(obj.tableName)}/domain/properties`,
                `Create${obj.rel.parentClass}Props`,
              );
              break;
            case 'complex':
              lines.push(
                `      get${upperFirst(camelCase(singularize(obj.col.name)))}: (user: IUserToken, ${camelCase(obj.col.name)}: Create${upperFirst(camelCase(obj.rel.childTable))}Props['${camelCase(obj.col.name)}']) => Promise<I${obj.rel.parentClass}${obj.rel.c_p === 'many' && obj.rel.c_ch === 'many' ? `[]` : ``}>;`,
              );
              break;
            case 'simple':
              lines.push(
                `      get${upperFirst(camelCase(obj.col.name))}: (user: IUserToken, ${camelCase(obj.col.name)}: ${obj.col.type}${obj.rel.c_p === 'many' && obj.rel.c_ch === 'many' ? `[]` : ``}) => Promise<I${obj.rel.parentClass}${obj.rel.c_p === 'many' && obj.rel.c_ch === 'many' ? `[]` : ``}>;`,
              );
              break;
          }
          addImport(
            imports,
            `../../../${kebabCase(obj.tableName)}/domain/entities`,
            `I${obj.rel.parentClass}`,
          );
        }
        lines.push(`    },`);
      }

      lines.push(`  ): Promise<${className}> {`);
      if (complexObjects.length) {
        lines.push(
          `    // Fetch all related entities in parallel for efficiency`,
        );
        lines.push(
          `    const [${complexObjects
            .filter(
              (obj) =>
                obj.type === 'simple' ||
                obj.type === 'complex' ||
                obj.type === 'recordset',
            )
            .map((obj) => camelCase(obj.col.name))
            .join(', ')}] = await Promise.all([`,
        );
        for (const obj of complexObjects) {
          switch (obj.type) {
            case 'recordset':

            case 'simple':
              lines.push(
                `      entityFetcher.get${upperFirst(camelCase(obj.col.name))}(user, createData.${obj.key}),`,
              );
              break;
            case 'complex':
              lines.push(
                `      entityFetcher.get${upperFirst(camelCase(singularize(obj.col.name)))}(user, createData.${obj.key}),`,
              );
              break;
          }
        }
        lines.push(`    ]);`);
        lines.push(``);
        lines.push(
          `    // Validate that all required entities were successfully fetched`,
        );
        lines.push(
          `    this.ensureEntitiesExist(${complexObjects.map((obj) => camelCase(obj.key)).join(', ')});`,
        );
        lines.push(``);
      }
      if (complexObjects.filter((obj) => obj.type === 'simple').length) {
        lines.push(
          `    // Apply complex business rules that span multiple entities`,
        );
        lines.push(
          `    this.validateEntityCombinations(${complexObjects
            .filter((obj) => obj.type === 'simple')
            .map((obj) => camelCase(obj.key))
            .join(', ')});`,
        );
        lines.push(``);
      }

      // table._relationships.forEach((relation) => {
      //   if (relation.parentTable === table.name) return;
      //   if (
      //     complexObjects.find((obj) => obj.key === camelCase(relation.childCol))
      //   ) {
      //     if (relation.c_p === 'many' && relation.c_ch === 'many') {
      //       lines.push(
      //         `    this.validate${upperFirst(camelCase(pluralize(relation.childCol)))}(${camelCase(relation.childCol)});`,
      //       );
      //     } else {
      //       if (relation.c_p === 'many' && relation.c_ch === 'many') {
      //         lines.push(
      //           `    this.validate${upperFirst(camelCase(pluralize(relation.childCol)))}(${camelCase(relation.childCol)});`,
      //         );
      //       } else {
      //         lines.push(
      //           `    this.validate${upperFirst(camelCase(relation.childCol))}(${camelCase(relation.childCol)});`,
      //         );
      //       }
      //     }
      //   } else {
      //     lines.push(
      //       `    this.validate${upperFirst(camelCase(relation.childCol))}(createData.${camelCase(relation.childCol)});`,
      //     );
      //   }
      // });

      // table.cols.forEach((col) => {
      //   if (col.datatype === 'JSON') {
      //     if (table._relationships.find((rel) => rel.childCol === col.name)) {
      //     } else {
      //       lines.push(
      //         `    this.validate${upperFirst(camelCase(col.name))}(createData.${camelCase(col.name)});`,
      //       );
      //     }
      //   }
      // });

      if (key.defaultvalue === 'uuid()') {
        lines.push(`    // Generate unique identifier for the new ${camelCase(className)}
    const ${camelCase(className)}Code = randomUUID();
`);
      }
      lines.push(
        `    // Create the aggregate using the factory method which emits creation events`,
      );
      lines.push(
        `    const ${camelCase(className)} = ${className}.create(user, {`,
      );
      for (const col of table.cols) {
        if (col.pk) {
          if (col.defaultvalue === 'uuid()') {
            lines.push(
              `      ${camelCase(col.name)}: ${className}Identifier.fromString(${camelCase(className)}Code),`,
            );
          } else {
            lines.push(
              `      ${camelCase(col.name)}: ${className}Identifier.fromString(createData.${camelCase(col.name)}),`,
            );
          }
        } else if (
          complexObjects.find((obj) => obj.key === camelCase(col.name))
        ) {
          lines.push(`      ${camelCase(col.name)},`);
        } else {
          lines.push(
            `      ${camelCase(col.name)}: createData.${camelCase(col.name)},`,
          );
        }
      }
      lines.push(`    });`);
      lines.push(``);
      if (complexObjects.length) {
        lines.push(`    return ${camelCase(className)};`);
      } else {
        lines.push(`    return Promise.resolve(${camelCase(className)});`);
      }
      lines.push(`  }`);
    }
    // Generate update methods (only if update interface exists)
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      generateUpdateMethods(
        imports,
        lines,
        className,
        table,
        relationships,
        true,
        entityType,
        complexObjects,
      );
    }

    // Generate relationship management methods
    generateRelationshipMethods(
      imports,
      lines,
      className,
      table,
      relationships,
      entityType,
      complexObjects,
    );

    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      // Generate deletion method
      generateDeletionMethod(lines, className, entityType, table);
    }

    // Generate validation methods
    generateValidationMethods(
      errors,
      imports,
      lines,
      className,
      table,
      relationships,
      new Set(complexObjects.map((obj) => obj.model.replace('I', ''))),
      entityType,
      complexObjects,
      schema.parameters?.[table.name],
    );

    lines.push('}');
    lines.push('');

    // Build imports string
    const importTs = Object.entries(imports)
      .map(([key, value]) => {
        if (value.size > 0) {
          if (key === '../exceptions') {
            // Add ESLint disable for potentially unused exception imports
            return `import { ${Array.from(value).sort().join(', ')} } from '${key}';`;
          }
          return `import { ${Array.from(value).sort().join(', ')} } from '${key}';`;
        }
        return null;
      })
      .filter(Boolean)
      .join('\n');

    // Write file
    const filePath = path.join(
      outDir,
      fileBase,
      'domain',
      'services',
      `${fileBase}-domain.service.ts`,
    );

    if (schema.excluded?.includes(`${fileBase}-domain.service.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-domain.service.ts as it is excluded.`,
      );
      continue;
    }

    await writeFileWithDir(filePath, importTs + '\n\n' + lines.join('\n'));
    logger.info(`Generated domain service: ${filePath}`);
  }
  return errors;
};

function generateUpdateMethods(
  imports,
  lines,
  className,
  table,
  relationships,
  hasUpdateInterface = false,
  entityType,
  complexObjects,
) {
  if (!hasUpdateInterface) {
    lines.push('  /**');
    lines.push(
      `   * Update methods would be generated here if Update${className}Props interface existed.`,
    );
    lines.push('   */');
    return;
  }

  lines.push(` /**
   * Coordinates complex ${camelCase(className)} updates with cross-cutting business rule validation.
   * This method handles updates that require complex validation across multiple properties
   * or external dependencies before delegating to individual aggregate methods.
`);
  lines.push('   *');
  lines.push('   * @param user - The user performing the update');
  lines.push(
    `   * @param ${camelCase(className)} - The ${className} aggregate to update`,
  );
  lines.push(
    '   * @param updateData - Partial update data containing the fields to update',
  );
  lines.push('   *');
  lines.push('   * @example');
  lines.push('   * ```typescript');
  lines.push(
    `   * await ${camelCase(className)}DomainService.update${className}Info(user, ${camelCase(className)}, {`,
  );
  lines.push('   *   name: "New Name",');
  lines.push('   *   description: "Updated description",');
  if (table.cols.find((col) => col.name === 'active')) {
    lines.push('   *   active: true');
  }
  lines.push('   * });');
  lines.push('   * ```');
  lines.push('   *');
  lines.push(
    '   * Note: This method validates cross-cutting business rules before applying changes.',
  );
  lines.push(
    "   * Each field is updated individually using the aggregate's focused update methods,",
  );
  lines.push(
    '   * ensuring proper validation and event emission for each change.',
  );
  lines.push('   */');
  lines.push(`  update${className}Info(`);
  lines.push('    user: IUserToken,');
  lines.push(`    ${camelCase(className)}: ${className},`);
  lines.push(`    updateData: Partial<Update${className}Props>,`);
  lines.push('  ): void {');
  if (complexObjects.length) {
    lines.push(
      '    // Apply complex business rules that span multiple properties or external dependencies',
    );
    lines.push(
      `    this.validate${className}UpdateBusinessRules(${camelCase(className)}, updateData);`,
    );
    lines.push('');
    lines.push(
      '    // Apply individual updates using focused aggregate methods',
    );
    lines.push(
      `    // Each aggregate method handles its own domain-specific validation`,
    );
  } else {
    lines.push(`    // Note: ${className} is a simple entity - complex cross-cutting validation is not needed.
    // All business rules are handled directly by the aggregate's update methods.

    // Apply updates using individual aggregate methods which handle validation and events`);
  }

  // Generate individual field updates
  table.cols.forEach((col) => {
    if (col.pk) return; // Skip primary key

    const relationship = relationships.find((r) => r.childCol === col.name);
    if (relationship) return; // Skip relationship columns

    const fieldName = camelCase(col.name);
    const updateMethodName = `update${upperFirst(fieldName)}`;

    lines.push(`    if (updateData.${fieldName} !== undefined) {`);
    lines.push(
      `      ${camelCase(className)}.${updateMethodName}(user, updateData.${fieldName});`,
    );
    lines.push('    }');
    lines.push('');
  });

  lines.push('  }');
  lines.push('');

  // Generate specific update methods for complex objects
  complexObjects.forEach((obj) => {
    const entityName = obj.model.replace('I', '');
    const fieldName = camelCase(obj.key);
    if (obj.rel.c_p === 'many' && obj.rel.c_ch === 'many') return; // Skip if an array relationship
    addImport(
      imports,
      `../../../${kebabCase(singularize(obj.rel.parentClass))}/domain/entities`,
      `I${obj.rel.parentClass}`,
    );
    lines.push(`  /**
   * Handles ${fieldName} updates with complex business rule validation.
   * This method applies domain service level business rules before delegating to the aggregate.
   */`);
    lines.push(`  update${upperFirst(fieldName)}(`);
    lines.push('    user: IUserToken,');
    lines.push(`    ${camelCase(className)}: ${className},`);
    lines.push(`    new${upperFirst(fieldName)}: I${obj.rel.parentClass},`);
    lines.push('  ): void {');
    lines.push(
      `        // Domain service business rule: Validate ${fieldName} compatibility with existing ${camelCase(className)} configuration`,
    );

    lines.push(
      `    this.validate${upperFirst(fieldName)}Compatibility(${camelCase(className)}, new${upperFirst(fieldName)});`,
    );
    lines.push('');
    lines.push(
      `    // Delegate to aggregate for the actual update and domain event emission`,
    );
    lines.push(
      `    ${camelCase(className)}.update${upperFirst(fieldName)}(user, new${upperFirst(fieldName)});`,
    );
    lines.push('  }');
    lines.push('');
  });

  // Generate configuration update method if there are multiple complex objects
  if (complexObjects.length) {
    lines.push(`  /**
   * Coordinates complex ${camelCase(className)} configuration updates with cross-configuration validation.
   * This method ensures configurations are compatible with each other before applying changes.
   */`);
    lines.push(`  updateConfiguration(`);
    lines.push('    user: IUserToken,');
    lines.push(`    ${camelCase(className)}: ${className},`);
    lines.push('    _config: {');

    table._relationships.forEach((relation) => {
      const col = table.cols.find((c) => c.name === relation.childCol);
      if (col && col.datatype === 'JSON') {
        addImport(
          imports,
          `../../../${kebabCase(relation.parentTable)}/domain/entities`,
          `I${relation.parentClass}`,
        );
        lines.push(`      ${camelCase(col.name)}?: I${relation.parentClass};`);
      }
    });

    lines.push('    },');
    lines.push('  ): void {');
    lines.push(
      '    // Validate that all configurations are compatible with each other',
    );
    if (complexObjects.length) {
      lines.push(
        `    this.validateConfigurationCompatibility(${camelCase(className)}, _config);`,
      );
    }
    lines.push('');
    lines.push(
      '    // Apply changes in the correct order to maintain business rule consistency',
    );

    table._relationships.forEach((relation) => {
      const col = table.cols.find((c) => c.name === relation.childCol);
      if (col && col.datatype === 'JSON') {
        const fieldName = camelCase(col.name);
        lines.push(`    if (_config.${fieldName}) {`);
        lines.push(
          `      ${camelCase(className)}.update${upperFirst(fieldName)}(user, _config.${fieldName});`,
        );
        lines.push('    }');
      }
    });

    lines.push('  }');
    lines.push('');
  }
}

function generateRelationshipMethods(
  imports,
  lines,
  className,
  table,
  relationships,
  entityType,
  complexObjects,
) {
  // Generate management methods for many-to-many relationships from complexObjects
  const manyToManyObjects = complexObjects.filter(
    (obj) =>
      obj.rel.c_p === 'many' &&
      obj.rel.c_ch === 'many' &&
      obj.col.defaultvalue !== 'object()',
  );

  manyToManyObjects.forEach((obj) => {
    const entityName = obj.model.replace('I', '');
    const fieldName = camelCase(obj.key);
    const pluralName = pluralize(entityName);
    const keyType = obj.col.type;
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      const col = table.cols.find((c) => c.name === obj.key);

      lines.push(`  /**
   * Handles complex ${singularize(fieldName)} management operations with coordination support.
   * This method provides a convenient interface for batch operations while
   * delegating all business rule enforcement to the aggregate.
   */`);
      addImport(
        imports,
        `../../../${kebabCase(obj.tableName)}/domain`,
        obj.model,
      );
      console.log(obj);
      lines.push(`  manage${upperFirst(fieldName)}(`);
      lines.push('    user: IUserToken,');
      lines.push(`    ${camelCase(className)}: ${className},`);
      lines.push('    operations: {');
      lines.push(`      add?: ${obj.model}[];`);
      lines.push(`      remove?: ${keyType}[];`);
      lines.push('    },');
      lines.push('  ): void {');
      lines.push(`    // Convert Create${upperFirst(singularize(fieldName))}Props to I${upperFirst(singularize(fieldName))} if needed, then delegate to aggregate
    // The aggregate handles all business rules including "at least one ${singularize(fieldName)}"
    const convertedOperations = {
      add: operations.add, // Assuming Create${upperFirst(singularize(fieldName))}Props is compatible with I${upperFirst(singularize(fieldName))}
      remove: operations.remove,
    };

    ${camelCase(className)}.manage${upperFirst(camelCase(pluralize(obj.rel.parentTable)))}InBulk(user, convertedOperations);`);
      lines.push('  }');
      lines.push('');
    }
  });
}

function generateDeletionMethod(lines, className, entityType, table) {
  lines.push(`  /**
   * Orchestrates the ${camelCase(className)} deletion process with domain service level coordination.
   * This method handles any complex preparation before delegating to the aggregate.
   */`);
  lines.push(
    `  initiate${className}Deletion(user: IUserToken, ${camelCase(className)}: ${entityType}): void {`,
  );
  if (table.cols.find((col) => col.name === 'isDefault')) {
    lines.push(`    // TODO: Implement active ${camelCase(className)} dependency checking before deletion
    // Business rule: Active ${camelCase(pluralize(className))} should be deactivated before deletion
    // This is a domain service level coordination rule (not a hard invariant)
    if (${camelCase(className)}.active) {
      this.logger.warn(
        'initiate${className}Deletion: Active ${camelCase(className)} dependency checking not implemented',
        {
          ${camelCase(className)}Id: ${camelCase(className)}.getId(),
          isActive: ${camelCase(className)}.active,
          isDefault: ${camelCase(className)}.isDefault,
        },
      );
      // TODO: In real implementation, this might involve:
      // - Checking external dependencies
      // - Requiring explicit confirmation that dependencies have been handled
      // - Coordinating with other bounded contexts
    }

    // Delegate to aggregate - it will enforce the "cannot delete default" business rule`);
  }

  lines.push(`    ${camelCase(className)}.markForDeletion(user);`);
  lines.push('  }');
  lines.push('');
}

function generateValidationMethods(
  errors,
  imports,
  lines,
  className,
  table,
  relationships,
  relatedEntities,
  entityType,
  complexObjects,
  parameters,
) {
  lines.push(`  // Private helper methods for complex business rule validation
`);
  // Generate configuration compatibility validation if there are multiple complex objects
  if (complexObjects.length) {
    lines.push(`/**
   * Ensures all required entities were successfully fetched from external sources.
   * This validation happens at domain service level since it involves multiple external entities.
   */`);
    lines.push('  private ensureEntitiesExist(');

    complexObjects.forEach((obj) => {
      const fieldName = camelCase(obj.key);
      if (obj.type === 'recordset') {
        lines.push(
          `    ${fieldName}${obj.col.nn ? '' : '?'}: Record<string, I${obj.rel.parentClass}>,`,
        );
      } else {
        lines.push(
          `    ${fieldName}${obj.col.nn ? '' : '?'}: I${obj.rel.parentClass}${obj.rel.c_ch === 'many' && obj.rel.c_p === 'many' ? '[]' : ''},`,
        );
      }
    });

    lines.push('  ): void {');

    complexObjects.forEach((obj) => {
      const fieldName = camelCase(obj.key);
      if (obj.col.nn) {
        if (obj.rel.c_ch === 'many' && obj.rel.c_p === 'many') {
          if (obj.col.defaultvalue === 'object()') {
            lines.push(`    if (!${fieldName} || Object.keys(${fieldName}).length === 0) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.${fieldName}OneRequired,
      );
    }`);
          } else {
            lines.push(`    if (!${fieldName} || ${fieldName}.length === 0) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.${fieldName}OneRequired,
      );
    }`);
          }
        } else {
          lines.push(`    if (!${fieldName}) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.${fieldName}NotFound,
      );
    }`);
        }
        lines.push(``);
      }
    });

    lines.push('  }');
    lines.push('');
    if (complexObjects.some((obj) => obj.type === 'simple')) {
      lines.push(`  /**
   * Validates complex business rules involving multiple entity combinations.
   * These are domain service level business rules that span multiple entities.
   */
  private validateEntityCombinations(`);
      complexObjects
        .filter((obj) => obj.type !== 'complex')
        .forEach((obj) => {
          const fieldName = camelCase(obj.key);
          lines.push(
            `    ${fieldName}${obj.col.nn ? '' : '?'}: I${obj.rel.parentClass}${obj.rel.c_ch === 'many' && obj.rel.c_p === 'many' ? '[]' : ''},`,
          );
        });
      lines.push(`  ): void {
    // TODO: Implement relationship compatibility validation
    // Business rule: Certain relationship combinations may not be allowed
    // This would involve complex business logic checking external requirements
    this.logger.warn(
      'validateEntityCombinations: Relationship compatibility validation not implemented',
    );

    // // Basic null checks - prevent silent failures
  }
`);
      errors[table.name]['invalidEntityCombinations'] = {
        message: `Invalid entity combinations for ${upperFirst(camelCase(table.name))}`,
        description: `Business rule violation: the specified entity combinations are not allowed`,
        code: `INVALID_ENTITY_COMBINATIONS_${snakeCase(table.name).toUpperCase()}`,
        exception: `${upperFirst(camelCase(table.name))}DomainException`,
        statusCode: 409,
        domain: true,
      };
    }
  }

  if (!parameters.cancel?.update) {
    if (complexObjects.length) {
      lines.push(`  /**
   * Validates complex business rules for ${camelCase(className)} updates that span multiple properties.
   * This handles domain service level business rules before delegating to aggregates.
   */`);
      lines.push(`  private validate${className}UpdateBusinessRules(`);
      lines.push(`    ${camelCase(className)}: ${entityType},`);
      lines.push(`    updateData: Partial<Update${className}Props>,`);
      lines.push('  ): void {');
      // Generate common business rules based on table structure
      if (table.cols.find((col) => col.name === 'category')) {
        lines.push(`    // TODO: Implement category change validation for active ${camelCase(pluralize(className))}
    // Business rule: Cannot change category of active ${camelCase(pluralize(className))} in certain situations
    if (
      updateData.category &&
      ${camelCase(className)}.active &&
      updateData.category !== ${camelCase(className)}.category
    ) {
      this.logger.warn(
        'validate${className}UpdateBusinessRules: Category change validation for active ${camelCase(pluralize(className))} not implemented',
        {
          ${camelCase(className)}Id: ${camelCase(className)}.getId(),
          currentCategory: ${camelCase(className)}.category,
          newCategory: updateData.category,
        },
      );
      // TODO: In real implementation, this might check external dependencies
      // or require specific business validations
    }`);
        lines.push('');
      }

      if (
        table.cols.find((col) => col.name === 'active') &&
        table.cols.find((col) => col.name === 'isDefault')
      ) {
        lines.push(`    // Business rule: Inactive ${camelCase(pluralize(className))} cannot be set as default
    if (updateData.active === false && updateData.isDefault === true) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.cannotSetInactiveAsDefault,
      );
    }`);
      }

      lines.push('  }');
      lines.push('');
    } else {
      lines.push(`  /**
   * Note: ${className} is a simple entity with basic properties and no cross-aggregate dependencies.
   * Complex business rule validation is not needed as all validation is handled by the aggregate itself.
   * This method is intentionally simplified compared to Product/Rail domain services which manage
   * complex relationships and cross-cutting concerns.
   */`);
    }
    errors[table.name]['cannotSetInactiveAsDefault'] = {
      message: `Cannot set an inactive ${className.toLowerCase()} as default. Please activate the ${className.toLowerCase()} first.`,
      description: `Business rule violation: inactive entities cannot be set as default`,
      code: `CANNOT_SET_INACTIVE_AS_DEFAULT_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 409,
      domain: true,
    };
  }

  if (complexObjects.length) {
    lines.push(`
  /**
   * Validates configuration compatibility across multiple configuration objects.
   * This ensures that configurations work together as a cohesive whole.
   */
  private validateConfigurationCompatibility(
    ${camelCase(className)}: ${className},
    _config: {`);
    table._relationships.forEach((relation) => {
      const col = table.cols.find((c) => c.name === relation.childCol);
      if (col && col.datatype === 'JSON') {
        addImport(
          imports,
          `../../../${kebabCase(relation.parentTable)}/domain/entities`,
          `I${relation.parentClass}`,
        );
        lines.push(`      ${camelCase(col.name)}?: I${relation.parentClass};`);
      }
    });
    lines.push(`    },
  ): void {
    // TODO: Implement cross-configuration compatibility validation
    // Business rule: Certain configurations may not be compatible with each other
    // In real implementation, this would involve:
    // - Checking each configuration's compatibility with others
    // - Ensuring that configurations do not conflict or violate business rules

    this.logger.warn(
      'validateConfigurationCompatibility: Cross-configuration compatibility validation not implemented',
      {
        ${camelCase(className)}Id: ${camelCase(className)}.getId(),
        configTypes: Object.keys(_config).filter(
          (key) => _config[key as keyof typeof _config] !== undefined,
        ),
      },
    );

    // Basic null checks - prevent silent failures
    if (!_config || Object.keys(_config).length === 0) {
      this.logger.warn(
        'validateConfigurationCompatibility: Empty configuration provided',
      );
    }
  }
`);
  }

  // // Generate validation methods for complex objects that need change validation
  // complexObjects.forEach((obj) => {
  //   const entityName = obj.model.replace('I', '');
  //   const fieldName = camelCase(obj.key);

  //   lines.push('  /**');
  //   lines.push(`   * Validates ${fieldName} change business rules`);
  //   lines.push('   */');
  //   lines.push(`  private validate${upperFirst(fieldName)}Change(`);
  //   lines.push(
  //     `    // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
  //   );
  //   lines.push(`    ${camelCase(className)}: ${className},`);
  //   lines.push(
  //     `    // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
  //   );
  //   addImport(
  //     imports,
  //     `../../../${kebabCase(singularize(obj.rel.parentClass))}/domain`,
  //     `I${obj.rel.parentClass}`,
  //   );
  //   lines.push(
  //     `    new${upperFirst(fieldName)}: I${upperFirst(singularize(fieldName))},`,
  //   );
  //   // lines.push(JSON.stringify(obj, null, 2));
  //   lines.push('  ): void {');
  //   lines.push(
  //     `    // This is where we'd add complex business logic for ${fieldName} changes`,
  //   );
  //   lines.push(
  //     `    // For example, checking if there are existing operations or transactions`,
  //   );
  //   lines.push(`    // that would be affected by the ${fieldName} change`);
  //   lines.push('');
  //   lines.push("    // For now, we'll do basic validation");
  //   lines.push('  }');
  //   lines.push('');
  // });

  // Generate validation methods for each entity from complexObjects
  complexObjects.forEach((obj) => {
    const fieldName = camelCase(obj.key);
    // const relationship = table._relationships.find(
    //   (r) => r.childCol === obj.key,
    // );
    // if (!relationship) return;

    lines.push(`  /**
   * Validates ${fieldName} compatibility with existing ${camelCase(className)} configuration.
   * This is domain service level business logic that involves external considerations.
   */`);
    lines.push(
      `  private validate${obj.rel.c_p === 'many' && obj.rel.c_ch === 'many' ? upperFirst(pluralize(fieldName)) : upperFirst(fieldName)}Compatibility(`,
    );
    lines.push(`    ${camelCase(className)}: ${className},`);
    lines.push(
      `    new${upperFirst(fieldName)}: I${obj.rel.parentClass}${obj.rel.c_p === 'many' && obj.rel.c_ch === 'many' ? '[]' : ''},`,
    );
    lines.push(`  ): void {`);
    lines.push(`    // TODO: Implement ${fieldName} compatibility validation
    // Business rule: ${upperFirst(fieldName)} changes may affect existing transactions/operations
    // In real implementation, this would involve:
    // - Checking for active transactions in the old ${fieldName}

    this.logger.warn(
      'validate${upperFirst(fieldName)}Compatibility: ${upperFirst(fieldName)} compatibility validation not implemented',
      {
        ${camelCase(className)}Id: ${camelCase(className)}.getId(),
        current${upperFirst(fieldName)}: ${camelCase(className)}.${fieldName}.value,
        new${upperFirst(fieldName)}: new${upperFirst(fieldName)},
      },
    );

    // Basic null check - prevent silent failures
    if (!new${upperFirst(fieldName)}) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.${fieldName}NotFound,
      );
    }`);
    lines.push(`  }`);
    lines.push('');
  });

  // if (!parameters.cancel?.create) {
  //   // Generate validation methods for non-entity fields (like interest, statement, etc.)
  //   table.cols.forEach((col) => {
  //     if (
  //       col.datatype === 'JSON' &&
  //       !complexObjects.find((obj) => obj.key === camelCase(col.name))
  //     ) {
  //       const fieldName = camelCase(col.name);
  //       const typeName = col.type || upperFirst(fieldName);

  //       lines.push('  /**');
  //       lines.push(`   * Validates ${fieldName} configuration`);
  //       lines.push('   */');
  //       // if (col.type !== 'Record<string, any>') {
  //       //   addImport(
  //       //     imports,
  //       //     `../../../${kebabCase(singularize(typeName))}/domain`,
  //       //     `Create${typeName}Props`,
  //       //   );
  //       // }
  //       if (col.datatype === 'JSON' && col.defaultvalue === 'object()') {
  //         lines.push(
  //           `  private validate${upperFirst(fieldName)}(${fieldName}: Record<string, Create${typeName}Props>): void {`,
  //         );
  //       } else {
  //         lines.push(
  //           `  private validate${upperFirst(fieldName)}(${fieldName}: ${typeName === `Record<string, any>` ? `Record<string, any> | undefined` : `Create${typeName}Props | string`}): void {`,
  //         );
  //       }
  //       if (col.nn) {
  //         lines.push(`    if (!${fieldName}) {`);
  //         lines.push(
  //           `      throw new ${className}DomainException(${className}ExceptionMessage.${fieldName}Required);`,
  //         );
  //         lines.push('    }');
  //       }
  //       lines.push('  }');
  //       lines.push('');
  //     }
  //   });
  // }
}

exports.create = create;
