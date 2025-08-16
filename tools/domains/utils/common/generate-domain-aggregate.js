const path = require('path');
const { writeFileWithDir } = require('../utils/file-utils');
const {
  buildImportLines,
  shouldSkipTable,
} = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  singularize,
  sentenceCase,
  pluralize,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

function generateCode(noVowels, id) {
  const code = id.toString().padStart(4, '0');
  return `${noVowels}${code}`;
}

const create = async (schema) => {
  const errors = {};

  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);

  for (const [tableId, table] of Object.entries(tables)) {
    errors[table.name] = {};

    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);

    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (!keys) {
      logger.warn(`Skipping table ${tableId} due to no primary key found.`);
      continue;
    }
    const key = keys[0];
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));

    // Create comprehensive error objects for domain aggregate operations
    errors[table.name]['userRequiredForOperation'] = {
      message: `User context is required for ${className} operations`,
      description: `Authentication is required to modify ${className} state`,
      code: `USER_REQUIRED_FOR_OPERATION_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['userRequiredForUpdates'] = {
      message: `User context is required for ${className} updates`,
      description: `Authentication is required for property updates on ${className}`,
      code: `USER_REQUIRED_FOR_UPDATES_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['userRequiredForDeletion'] = {
      message: `User context is required for ${className} deletion operations`,
      description: `Authentication is required to delete ${className} entities`,
      code: `USER_REQUIRED_FOR_DELETION_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['userRequiredForEnable'] = {
      message: `User context is required for ${className} enable operations`,
      description: `Authentication is required to enable ${className} entities`,
      code: `USER_REQUIRED_FOR_ENABLE_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['userRequiredForDisable'] = {
      message: `User context is required for ${className} disable operations`,
      description: `Authentication is required to disable ${className} entities`,
      code: `USER_REQUIRED_FOR_DISABLE_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['userRequiredForStatus'] = {
      message: `User context is required for ${className} status updates`,
      description: `Authentication is required to update ${className} status`,
      code: `USER_REQUIRED_FOR_STATUS_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['invalidStatusValue'] = {
      message: `Status value is required for ${className}`,
      description: `A valid status value must be provided when updating ${className} status`,
      code: `INVALID_STATUS_VALUE_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['cannotDeactivateDefault'] = {
      message: `Cannot deactivate a default ${className.toLowerCase()}. Please set another ${className.toLowerCase()} as default first.`,
      description: `Business rule violation: default entities cannot be deactivated without setting another as default`,
      code: `CANNOT_DEACTIVATE_DEFAULT_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 409,
      domain: true,
    };

    errors[table.name]['cannotSetInactiveAsDefault'] = {
      message: `Cannot set an inactive ${className.toLowerCase()} as default. Please activate the ${className.toLowerCase()} first.`,
      description: `Business rule violation: inactive entities cannot be set as default`,
      code: `CANNOT_SET_INACTIVE_AS_DEFAULT_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 409,
      domain: true,
    };

    // Create field-specific required errors for each non-PK, non-tenant column
    table.cols
      .filter((col) => col.name !== 'tenant' && !col.pk && col.nn)
      .forEach((col) => {
        const fieldName = upperFirst(camelCase(col.name));
        const colType = col.type;

        if (colType === 'string') {
          errors[table.name][`field${fieldName}Required`] = {
            message: `${sentenceCase(col.name)} is required and cannot be empty`,
            description: `The ${col.name} field is required for ${className} and must be a non-empty string`,
            code: `INVALID_${col.name.toUpperCase()}_VALUE`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };
        } else if (colType === 'number') {
          errors[table.name][`field${fieldName}Required`] = {
            message: `${sentenceCase(col.name)} is required`,
            description: `The ${col.name} field is required for ${className} and must be a valid number`,
            code: `INVALID_${col.name.toUpperCase()}_VALUE`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };
        } else if (colType === 'boolean') {
          errors[table.name][`field${fieldName}Required`] = {
            message: `${sentenceCase(col.name)} is required`,
            description: `The ${col.name} field is required for ${className} and must be a valid boolean`,
            code: `INVALID_${col.name.toUpperCase()}_VALUE`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };
        } else {
          errors[table.name][`field${fieldName}Required`] = {
            message: `${sentenceCase(col.name)} is required`,
            description: `The ${col.name} field is required for ${className}`,
            code: `INVALID_${col.name.toUpperCase()}_VALUE`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };
        }
      });

    // Check if this aggregate should be excluded
    const fileName = `${fileBase}.aggregate.ts`;
    if (schema.excluded?.includes(fileName)) {
      logger.info(`Skipping generation of ${fileName} as it is excluded.`);
      continue;
    }

    const imports = [];
    addImport(imports, '@nestjs/cqrs', `AggregateRoot`);
    addImport(imports, 'src/shared/auth', `IUserToken`);
    addImport(imports, '../entities', `I${className}`);
    addImport(imports, '../exceptions', [
      `${className}ExceptionMessage`,
      `${className}DomainException`,
    ]);
    addImport(imports, `../properties`, `${className}Props`);
    addImport(imports, 'src/shared/domain/domain.model', `IAggregateWithDto`);
    addImport(imports, `../value-objects`, `${className}Identifier`);

    // Collect complex objects (relationships) for proper handling
    const complexObjects = [];
    const relationships = table._relationships || [];

    relationships.forEach((rel) => {
      const col = table.cols.find((c) => c.name === rel.childCol);
      if (col) {
        complexObjects.push({
          propertyName: camelCase(rel.childCol),
          className: rel.parentClass,
          kebabName: kebabCase(rel.parentClass),
          isArray: rel.c_p === 'many' && rel.c_ch === 'many',
          isSingle: rel.c_p === 'one' && rel.c_ch === 'many',
          isSet:
            col.defaultvalue === 'object()' &&
            rel.c_p === 'many' &&
            rel.c_ch === 'many',
          nullable: !col.nn,
          relationship: rel,
        });
      }
    });

    // Create relationship-specific error objects for many-to-many relationships
    relationships
      .filter(
        (rel) =>
          rel.isChild &&
          rel.c_ch === 'many' &&
          rel.c_p === 'many' &&
          rel.parent !== table.name,
      )
      .forEach((rel) => {
        const col = table.cols.find((col) => col.name === rel.childCol);
        if (col && col.datatype !== 'JSON') {
          const singular = singularize(rel.childCol);
          const singularClass = singularize(rel.parentClass);
          const entityName = rel.parentClass;

          // User context required error for relationship operations
          errors[table.name][
            `userRequiredFor${upperFirst(camelCase(singular))}Operations`
          ] = {
            message: `User context is required for ${entityName.toLowerCase()} operations`,
            description: `Authentication is required to modify ${className} ${camelCase(rel.childCol)} relationships`,
            code: `USER_REQUIRED_FOR_${singular.toUpperCase()}_OPERATIONS_${table.name.toUpperCase()}`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };

          // Invalid entity data error
          errors[table.name][`invalid${upperFirst(singularClass)}Data`] = {
            message: `${sentenceCase(singularClass)} is required`,
            description: `A valid ${singularClass} entity must be provided for ${className} operations`,
            code: `INVALID_${singular.toUpperCase()}_DATA`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };

          // Duplicate entity error
          errors[table.name][`duplicate${upperFirst(singularClass)}Error`] = {
            message: `${sentenceCase(singularClass)} already exists in this ${className.toLowerCase()}`,
            description: `The ${singularClass} is already associated with this ${className} and cannot be added again`,
            code: `DUPLICATE_${singular.toUpperCase()}_ERROR`,
            exception: `${className}DomainException`,
            statusCode: 409,
            domain: true,
          };

          // Invalid parameter error for removal operations
          errors[table.name][
            `invalid${upperFirst(camelCase(rel.parentCol))}Parameter`
          ] = {
            message: `${sentenceCase(camelCase(rel.parentCol))} is required for ${entityName.toLowerCase()} removal`,
            description: `A valid ${camelCase(rel.parentCol)} must be provided to remove ${singularClass} from ${className}`,
            code: `INVALID_${rel.parentCol.toUpperCase()}_PARAMETER`,
            exception: `${className}DomainException`,
            statusCode: 400,
            domain: true,
          };
        }
      });

    const lines = [];
    lines.push(``);
    lines.push(
      `export class ${className} extends AggregateRoot implements IAggregateWithDto<I${className}> {`,
    );

    // Generate private property declarations
    table.cols
      .filter((c) => c.name !== 'tenant')
      .forEach((col) => {
        const complexObj = complexObjects.find(
          (co) => co.propertyName === camelCase(col.name),
        );

        if (complexObj) {
          // Add imports for complex objects
          if (!schema.parameters?.[table.name]?.cancel?.update) {
            addImport(
              imports,
              `../../../${complexObj.kebabName}/domain`,
              `I${complexObj.className}`,
            );
          }

          if (complexObj.isArray || complexObj.isSet) {
            const valueType = complexObj.isSet
              ? `${complexObj.className}Set`
              : `${complexObj.className}List`;
            addImport(
              imports,
              `../value-objects/${kebabCase(col.name)}${complexObj.isSet ? '-set' : '-list'}`,
              valueType,
            );
            lines.push(
              `  private _${camelCase(col.name)}${complexObj.nullable ? '?' : ''}: ${valueType};`,
            );
          } else if (complexObj.isSingle) {
            addImport(
              imports,
              `../value-objects/${kebabCase(col.name)}`,
              `${complexObj.className}Value`,
            );
            lines.push(
              `  private _${camelCase(col.name)}${complexObj.nullable ? '?' : ''}: ${complexObj.className}Value;`,
            );
          }
        } else {
          // Simple property
          if (col.enum) {
            addImport(imports, `../entities`, col.type);
          }
          if (col.datatype === 'JSON' && col.enum) {
            lines.push(
              `  private _${camelCase(col.name)}${col.nn ? '' : '?'}: ${col.type}${col.nn ? '[]' : ''};`,
            );
          } else {
            if (col.pk && col.datatype !== 'JSON') {
              lines.push(
                `  private readonly _${camelCase(col.name)}: ${className}Identifier;`,
              );
            } else {
              lines.push(
                `  private _${camelCase(col.name)}${col.nn ? '' : '?'}: ${col.type};`,
              );
            }
          }
        }
      });

    lines.push(``);
    lines.push(`  constructor(props: ${className}Props) {`);
    lines.push(`    super();`);

    // Generate constructor assignments
    table.cols
      .filter((c) => c.name !== 'tenant')
      .forEach((col) => {
        const complexObj = complexObjects.find(
          (co) => co.propertyName === camelCase(col.name),
        );

        if (complexObj) {
          if (complexObj.isArray || complexObj.isSet) {
            const valueType = complexObj.isSet
              ? `${complexObj.className}Set`
              : `${complexObj.className}List`;
            if (complexObj.nullable) {
              lines.push(
                `    this._${camelCase(col.name)} = props.${camelCase(col.name)}`,
              );
              lines.push(
                `      ? new ${valueType}(props.${camelCase(col.name)})`,
              );
              lines.push(`      : undefined;`);
            } else {
              lines.push(
                `    this._${camelCase(col.name)} = new ${valueType}(props.${camelCase(col.name)});`,
              );
            }
          } else if (complexObj.isSingle) {
            if (complexObj.nullable) {
              lines.push(
                `    this._${camelCase(col.name)} = props.${camelCase(col.name)}`,
              );
              lines.push(
                `      ? new ${complexObj.className}Value(props.${camelCase(col.name)})`,
              );
              lines.push(`      : undefined;`);
            } else {
              lines.push(
                `    this._${camelCase(col.name)} = new ${complexObj.className}Value(props.${camelCase(col.name)});`,
              );
            }
          }
        } else {
          // Simple assignment
          lines.push(
            `    this._${camelCase(col.name)} = props.${camelCase(col.name)};`,
          );
        }
      });

    lines.push(`    this.validateState();`);
    lines.push(`  }`);
    lines.push(``);

    lines.push(`  getId(): string {`);
    lines.push(`    return this._${camelCase(key.name)}.toString();`);
    lines.push(`  }`);
    lines.push(``);

    // Generate getter methods
    table.cols
      .filter((c) => c.name !== 'tenant')
      .forEach((col) => {
        const complexObj = complexObjects.find(
          (co) => co.propertyName === camelCase(col.name),
        );

        if (col.pk && col.datatype !== 'JSON') {
          lines.push(
            `  get ${camelCase(key.name)}(): ${className}Identifier {`,
          );
          lines.push(`    return this._${camelCase(col.name)};`);
        } else {
          if (complexObj) {
            if (complexObj.isArray || complexObj.isSet) {
              const valueType = complexObj.isSet
                ? `${complexObj.className}Set`
                : `${complexObj.className}List`;
              lines.push(
                `  public get ${camelCase(col.name)}(): ${valueType}${complexObj.nullable ? ' | undefined' : ''} {`,
              );
            } else if (complexObj.isSingle) {
              lines.push(
                `  public get ${camelCase(col.name)}(): ${complexObj.className}Value${complexObj.nullable ? ' | undefined' : ''} {`,
              );
            }
          } else {
            if (col.enum) {
              addImport(imports, `../entities`, col.type);
            }
            if (col.datatype === 'JSON' && col.enum) {
              lines.push(
                `  public get ${camelCase(col.name)}(): ${col.type}${col.nn ? '[]' : '[] | undefined'} {`,
              );
            } else {
              lines.push(
                `  public get ${camelCase(col.name)}(): ${col.type}${col.nn ? '' : ' | undefined'} {`,
              );
            }
          }

          lines.push(`    return this._${camelCase(col.name)};`);
        }
        lines.push(`  }`);
        lines.push(``);
      });

    lines.push(`  /**`);
    lines.push(
      `   * Factory method for reconstructing ${className} aggregate from persisted entity data`,
    );
    lines.push(
      `   * This ensures proper value object creation during repository hydration`,
    );
    lines.push(
      `   * @param entity - The persisted ${camelCase(className)} entity from repository`,
    );
    lines.push(`   * @returns Properly reconstructed ${className} aggregate`);
    lines.push(`   */`);
    lines.push(
      `  public static fromEntity(entity: I${className}): ${className} {`,
    );
    lines.push(`    const props: ${className}Props = {`);
    table.cols
      .filter((c) => c.name !== 'tenant')
      .forEach((col) => {
        if (col.name === key.name) {
          lines.push(
            `      ${camelCase(col.name)}: ${className}Identifier.fromString(entity.${camelCase(col.name)}),`,
          );
        } else {
          lines.push(
            `      ${camelCase(col.name)}: entity.${camelCase(col.name)},`,
          );
        }
      });
    lines.push(`    };`);
    lines.push(``);
    lines.push(`    return new ${className}(props);`);
    lines.push(`  }`);
    lines.push(``);

    // Generate toDto method
    lines.push(`  public toDto(): I${className} {`);
    lines.push(`    return {`);

    table.cols
      .filter((c) => c.name !== 'tenant')
      .forEach((col) => {
        const complexObj = complexObjects.find(
          (co) => co.propertyName === camelCase(col.name),
        );

        if (complexObj) {
          lines.push(
            `      ${camelCase(col.name)}: this._${camelCase(col.name)}${complexObj.nullable ? '?' : ''}.value,`,
          );
        } else {
          if (col.pk && col.datatype !== 'JSON') {
            lines.push(
              `      ${camelCase(col.name)}: this._${camelCase(col.name)}.value,`,
            );
          } else {
            lines.push(
              `      ${camelCase(col.name)}: this._${camelCase(col.name)},`,
            );
          }
        }
      });
    lines.push(`    };`);
    lines.push(`  }`);
    lines.push(``);

    if (!schema.parameters?.[table.name]?.cancel?.create) {
      addImport(imports, '../events', `${className}CreatedEvent`);
      lines.push(`
  /**
   * Factory method to create a new ${className} aggregate with proper event sourcing
   * Use this method instead of the constructor when creating new ${camelCase(pluralize(className))}
   * @param user - The user creating the ${camelCase(className)}
   * @param props - The ${camelCase(className)} properties
   * @returns A new ${className} aggregate with ${className}CreatedEvent applied
   */
  static create(user: IUserToken, props: ${className}Props): ${className} {
    const ${camelCase(className)} = new ${className}(props);

    // Emit creation event for event sourcing
    ${camelCase(className)}.apply(
      new ${className}CreatedEvent(user, ${camelCase(className)}.getId(), ${camelCase(className)}.toDto()),
    );

    return ${camelCase(className)};
  }
`);
    }

    // Generate individual property update methods (not the single updateBasicInfo)
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      // Add UpdatedEvent import
      addImport(imports, '../events', `${className}UpdatedEvent`);

      table.cols
        .filter((col) => col.name !== 'tenant' && !col.pk)
        .forEach((col) => {
          const complexObj = complexObjects.find(
            (co) => co.propertyName === camelCase(col.name),
          );

          if (!complexObj) {
            // Skip status column if it's an enum - we'll handle it separately
            if (col.name === 'status' && col.datatype === 'ENUM') {
              return;
            }

            // Generate individual update method for simple properties
            const methodName = `update${upperFirst(camelCase(col.name))}`;
            const paramType = col.type;
            const paramName = camelCase(col.name);

            lines.push(`  /**`);
            lines.push(
              `   * Updates the ${sentenceCase(col.name)} property of the ${className.toLowerCase()}.`,
            );
            lines.push(`   * Business rules:`);
            lines.push(
              `   * - ${col.nn ? 'Value is required and cannot be empty' : 'Value is optional'}`,
            );
            lines.push(
              `   * - Emits ${className}UpdatedEvent on successful change`,
            );
            lines.push(`   * @param user - The user performing the operation`);
            lines.push(
              `   * @param ${paramName} - The new ${sentenceCase(col.name)} value`,
            );
            lines.push(
              `   * @param emitEvent - Whether to emit domain events (default: true)`,
            );
            lines.push(
              `   * @throws {${className}DomainException} When validation fails or business rules are violated`,
            );
            lines.push(`   */`);
            lines.push(`  public ${methodName}(`);
            lines.push(`    user: IUserToken,`);
            lines.push(`    ${paramName}${col.nn ? '' : '?'}: ${paramType},`);
            lines.push(`    emitEvent = true,`);
            lines.push(`  ): void {`);

            // Add user validation
            lines.push(`    // Validate user context`);
            lines.push(`    if (!user) {`);
            lines.push(
              `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredForUpdates);`,
            );
            lines.push(`    }`);
            lines.push(``);

            // Add validation for required fields
            if (col.nn) {
              if (paramType === 'string') {
                lines.push(`    // Validate required string field`);
                lines.push(
                  `    if (!${paramName} || ${paramName}.trim() === '') {`,
                );
                lines.push(
                  `      throw new ${className}DomainException(${className}ExceptionMessage.field${upperFirst(camelCase(col.name))}Required);`,
                );
                lines.push(`    }`);
                lines.push(``);
              } else if (paramType === 'number') {
                lines.push(`    // Validate required number field`);
                lines.push(
                  `    if (${paramName} === undefined || ${paramName} === null) {`,
                );
                lines.push(
                  `      throw new ${className}DomainException(${className}ExceptionMessage.field${upperFirst(camelCase(col.name))}Required);`,
                );
                lines.push(`    }`);
                lines.push(``);
              } else if (paramType === 'boolean') {
                lines.push(`    // Validate required boolean field`);
                lines.push(
                  `    if (${paramName} === undefined || ${paramName} === null) {`,
                );
                lines.push(
                  `      throw new ${className}DomainException(${className}ExceptionMessage.field${upperFirst(camelCase(col.name))}Required);`,
                );
                lines.push(`    }`);
                lines.push(``);
              }
            }

            // Add special business rules for common patterns
            if (
              col.name === 'active' &&
              table.cols.find((c) => c.name === 'isDefault')
            ) {
              lines.push(
                `    // Business rule: Cannot deactivate a default ${className.toLowerCase()}`,
              );
              lines.push(`    if (!${paramName} && this._isDefault) {`);
              lines.push(
                `      throw new ${className}DomainException(${className}ExceptionMessage.cannotDeactivateDefault);`,
              );
              lines.push(`    }`);
              lines.push(``);
            }

            if (
              col.name === 'isDefault' &&
              table.cols.find((c) => c.name === 'active')
            ) {
              lines.push(
                `    // Business rule: Cannot set inactive ${className.toLowerCase()} as default`,
              );
              lines.push(`    if (${paramName} && !this._active) {`);
              lines.push(
                `      throw new ${className}DomainException(${className}ExceptionMessage.cannotSetInactiveAsDefault);`,
              );
              lines.push(`    }`);
              lines.push(``);
            }

            // Store old value for change detection
            lines.push(
              `    const old${upperFirst(paramName)} = this._${paramName};`,
            );

            // Update the value with proper trimming for strings
            if (paramType === 'string' && col.nn) {
              lines.push(`    this._${paramName} = ${paramName}.trim();`);
            } else {
              lines.push(`    this._${paramName} = ${paramName};`);
            }
            lines.push(``);

            // Emit event only if value actually changed
            lines.push(`    // Emit event only if value actually changed`);
            lines.push(
              `    if (old${upperFirst(paramName)} !== this._${paramName} && emitEvent) {`,
            );
            lines.push(`      this.validateState();`);
            lines.push(
              `      this.apply(new ${className}UpdatedEvent(user, this.getId(), this.toDto()));`,
            );
            lines.push(`    }`);
            lines.push(`  }`);
            lines.push(``);
          }
        });
    }

    // Generate value object update methods
    complexObjects.forEach((complexObj) => {
      if (
        complexObj.isSingle &&
        !schema.parameters?.[table.name]?.cancel?.update
      ) {
        const methodName = `update${upperFirst(complexObj.propertyName)}`;

        // Add imports for equals and to functions
        addImport(imports, `../../../${complexObj.kebabName}/domain`, [
          `${camelCase(complexObj.className)}Equals`,
          `to${upperFirst(complexObj.className)}`,
        ]);

        lines.push(`  public ${methodName}(`);
        lines.push(`    user: IUserToken,`);
        lines.push(
          `    new${complexObj.className}: I${complexObj.className} | string,`,
        );
        lines.push(`  ): void {`);
        lines.push(
          `    // All business rule validation is handled in to${upperFirst(complexObj.className)}`,
        );
        lines.push(
          `    const normalized = to${upperFirst(complexObj.className)}(new${complexObj.className});`,
        );
        lines.push(
          `    if (!${camelCase(complexObj.className)}Equals(this._${complexObj.propertyName}${complexObj.nullable ? '?' : ''}.value, normalized)) {`,
        );
        lines.push(
          `      this._${complexObj.propertyName} = new ${complexObj.className}Value(normalized);`,
        );
        lines.push(
          `      this.apply(new ${className}UpdatedEvent(user, this.getId(), this.toDto()));`,
        );
        lines.push(`    }`);
        lines.push(`  }`);
        lines.push(``);
      }
    });
    // Generate enable/disable methods if enabled column exists
    if (
      table.cols.find(
        (col) => col.name === 'enabled' && col.datatype === 'BOOLEAN',
      )
    ) {
      lines.push(`  /**`);
      lines.push(`   * Enables the ${className.toLowerCase()}.`);
      lines.push(`   * Business rules:`);
      lines.push(`   * - Idempotent operation (no-op if already enabled)`);
      lines.push(`   * - Emits ${className}EnabledEvent on state change`);
      lines.push(`   * @param user - The user performing the operation`);
      lines.push(
        `   * @throws {${className}DomainException} When user context is invalid`,
      );
      lines.push(`   */`);
      lines.push(`  public enable(user: IUserToken): void {`);
      lines.push(`    // Validate user context`);
      lines.push(`    if (!user) {`);
      lines.push(
        `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredForEnable);`,
      );
      lines.push(`    }`);
      lines.push(``);
      lines.push(
        `    // Enable only if currently disabled (idempotent operation)`,
      );
      lines.push(`    if (!this._enabled) {`);
      lines.push(`      this._enabled = true;`);
      addImport(imports, '../events', `${className}EnabledEvent`);
      lines.push(
        `      this.apply(new ${className}EnabledEvent(user, this.getId(), this.toDto()));`,
      );
      lines.push(`      this.validateState();`);
      lines.push(`    }`);
      lines.push(`  }`);
      lines.push(``);

      lines.push(`  /**`);
      lines.push(`   * Disables the ${className.toLowerCase()}.`);
      lines.push(`   * Business rules:`);
      lines.push(`   * - Idempotent operation (no-op if already disabled)`);
      lines.push(`   * - Emits ${className}DisabledEvent on state change`);
      lines.push(`   * @param user - The user performing the operation`);
      lines.push(
        `   * @throws {${className}DomainException} When user context is invalid`,
      );
      lines.push(`   */`);
      lines.push(`  public disable(user: IUserToken): void {`);
      lines.push(`    // Validate user context`);
      lines.push(`    if (!user) {`);
      lines.push(
        `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredForDisable);`,
      );
      lines.push(`    }`);
      lines.push(``);
      lines.push(
        `    // Disable only if currently enabled (idempotent operation)`,
      );
      lines.push(`    if (this._enabled) {`);
      lines.push(`      this._enabled = false;`);
      addImport(imports, '../events', `${className}DisabledEvent`);
      lines.push(
        `      this.apply(new ${className}DisabledEvent(user, this.getId(), this.toDto()));`,
      );
      lines.push(`      this.validateState();`);
      lines.push(`    }`);
      lines.push(`  }`);
      lines.push(``);
    }

    // Generate status update method if status column exists
    if (
      table.cols.find((col) => col.name === 'status' && col.datatype === 'ENUM')
    ) {
      lines.push(`  /**`);
      lines.push(`   * Updates the status of the ${className.toLowerCase()}.`);
      lines.push(`   * Business rules:`);
      lines.push(`   * - Idempotent operation (no-op if status is the same)`);
      lines.push(`   * - Emits ${className}UpdatedEvent on status change`);
      lines.push(`   * - Validates aggregate state after status change`);
      lines.push(`   * @param user - The user performing the operation`);
      lines.push(`   * @param status - The new status value`);
      lines.push(
        `   * @throws {${className}DomainException} When user context is invalid or status is invalid`,
      );
      lines.push(`   */`);
      lines.push(
        `  updateStatus(user: IUserToken, status: ${className}StatusEnum): void {`,
      );
      lines.push(`    // Validate user context`);
      lines.push(`    if (!user) {`);
      lines.push(
        `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredForStatus);`,
      );
      lines.push(`    }`);
      lines.push(``);
      lines.push(`    // Validate status value`);
      lines.push(`    if (!status) {`);
      lines.push(
        `      throw new ${className}DomainException(${className}ExceptionMessage.invalidStatusValue);`,
      );
      lines.push(`    }`);
      lines.push(``);
      lines.push(`    // No-op if status is the same (idempotent operation)`);
      lines.push(`    if (this._status === status) {`);
      lines.push(`      return; // No change needed`);
      lines.push(`    }`);
      lines.push(``);
      lines.push(`    // Update status and emit event`);
      lines.push(`    this._status = status;`);
      addImport(imports, '../events', `${className}UpdatedEvent`);
      lines.push(
        `    this.apply(new ${className}UpdatedEvent(user, this.getId(), this.toDto()));`,
      );
      lines.push(`    this.validateState();`);
      lines.push(`  }`);
      lines.push(``);
    }

    // Business rule validations
    // Generate markForDeletion method
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      addImport(imports, `../events`, `${className}DeletedEvent`);

      lines.push(`  /**`);
      lines.push(`   * Marks the ${className.toLowerCase()} for deletion.`);
      lines.push(
        `   * This method initiates the deletion process and emits the appropriate domain event.`,
      );
      lines.push(`   * Business rules:`);
      lines.push(`   * - User context is required`);
      lines.push(
        `   * - Cannot delete default ${camelCase(pluralize(className))}`,
      );
      lines.push(
        `   * - Emits ${className}DeletedEvent to trigger deletion workflows`,
      );
      lines.push(
        `   * @param user - The user performing the deletion operation`,
      );
      lines.push(
        `   * @throws {${className}DomainException} When user context is invalid or business rules are violated`,
      );
      lines.push(`   */`);
      lines.push(`  markForDeletion(user: IUserToken): void {`);
      lines.push(`    // Validate user context`);
      lines.push(`    if (!user) {`);
      lines.push(
        `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredForDeletion);`,
      );
      lines.push(`    }`);
      lines.push(``);
      if (
        table.cols.find(
          (col) => col.name === 'isDefault' && col.datatype === 'BOOLEAN',
        )
      ) {
        lines.push(`    // Business rule: Cannot delete default ${camelCase(pluralize(className))}
    if (this._isDefault) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.cannotDeleteDefault,
      );
    }`);
      }
      lines.push(``);
      lines.push(`    // Emit deletion event to initiate deletion process`);
      lines.push(
        `    this.apply(new ${className}DeletedEvent(user, this.getId(), this.toDto()));`,
      );
      lines.push(`  }`);
      lines.push(``);
    }

    // Generate validateState method
    lines.push(`  private validateState(): void {`);
    table.cols
      .filter((col) => col.name !== 'tenant')
      .forEach((col) => {
        const complexObj = complexObjects.find(
          (co) => co.propertyName === camelCase(col.name),
        );

        if (complexObj) {
          if (complexObj.isArray || complexObj.isSet) {
            const validatorFn = complexObj.isSet
              ? `validateRecordOf${pluralize(complexObj.className)}`
              : `validateArrayOf${pluralize(complexObj.className)}`;
            addImport(
              imports,
              `../../../${complexObj.kebabName}/domain/value-objects`,
              validatorFn,
            );
            lines.push(
              `    ${complexObj.nullable ? `if (this._${camelCase(col.name)}?.value) ` : ''}${validatorFn}(this._${camelCase(col.name)}.value);`,
            );
          } else if (complexObj.isSingle) {
            addImport(
              imports,
              `../../../${complexObj.kebabName}/domain/value-objects`,
              `validate${complexObj.className}`,
            );
            lines.push(
              `    ${complexObj.nullable ? `if (this._${camelCase(col.name)}?.value) ` : ''}validate${complexObj.className}(this._${camelCase(col.name)}.value);`,
            );
          }
          lines.push(``);
        } else {
          if (col.nn) {
            lines.push(`    if (!this._${camelCase(col.name)}) {`);
            lines.push(
              `      throw new ${className}DomainException(${className}ExceptionMessage.field${upperFirst(camelCase(col.name))}Required);`,
            );
            lines.push(`    }`);
            lines.push(``);
          }
        }
      });
    lines.push(`  }`);
    lines.push(``);

    // Generate toProps method
    lines.push(`  public toProps(): ${className}Props {`);
    lines.push(`    return {`);
    table.cols
      .filter((col) => col.name !== 'tenant')
      .forEach((col) => {
        const complexObj = complexObjects.find(
          (co) => co.propertyName === camelCase(col.name),
        );

        if (complexObj) {
          lines.push(
            `      ${camelCase(col.name)}: this._${camelCase(col.name)}${complexObj.nullable ? '?' : ''}.value,`,
          );
        } else {
          lines.push(
            `      ${camelCase(col.name)}: this._${camelCase(col.name)},`,
          );
        }
      });
    lines.push(`    };`);
    lines.push(`  }`);
    lines.push(``);

    // Generate add/remove methods for many-to-many relationships with improved patterns
    relationships
      .filter(
        (rel) =>
          rel.isChild &&
          rel.c_ch === 'many' &&
          rel.c_p === 'many' &&
          rel.parent !== table.name,
      )
      .forEach((rel) => {
        const col = table.cols.find((col) => col.name === rel.childCol);
        if (col.datatype === 'JSON') {
          return;
        }
        if (schema.parameters?.[table.name]?.cancel?.update) {
          return;
        }
        const singular = singularize(rel.childCol);
        const singularClass = singularize(rel.parentClass);
        const propertyName = camelCase(rel.childCol);
        const entityName = rel.parentClass;

        addImport(
          imports,
          `../../../${kebabCase(rel.parentClass)}/domain/value-objects`,
          `validate${rel.parentClass}`,
        );

        // Add method with improved documentation and validation
        lines.push(`  /**`);
        lines.push(
          `   * Adds a ${sentenceCase(singularClass)} to the ${className.toLowerCase()}'s ${sentenceCase(propertyName)}.`,
        );
        lines.push(`   * Business rules:`);
        lines.push(`   * - The ${sentenceCase(singularClass)} must be valid`);
        lines.push(
          `   * - Duplicate ${sentenceCase(singularClass)} are not allowed`,
        );
        lines.push(
          `   * - Emits ${className}${upperFirst(camelCase(singular))}AddedEvent on success`,
        );
        lines.push(`   * @param user - The user performing the operation`);
        lines.push(
          `   * @param ${camelCase(singular)} - The ${sentenceCase(singularClass)} to add`,
        );
        lines.push(
          `   * @throws {${className}DomainException} When the ${sentenceCase(singularClass)} is invalid or already exists`,
        );
        lines.push(`   */`);
        lines.push(
          `  add${upperFirst(singularize(camelCase(rel.childCol)))}(user: IUserToken, ${camelCase(singular)}: I${rel.parentClass}): void {`,
        );

        // Input validation
        lines.push(`    // Validate user context`);
        lines.push(`    if (!user) {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredFor${upperFirst(camelCase(singular))}Operations);`,
        );
        lines.push(`    }`);
        lines.push(``);

        lines.push(`    // Validate ${entityName} entity`);
        lines.push(`    if (!${camelCase(singular)}) {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.invalid${upperFirst(singularClass)}Data);`,
        );
        lines.push(`    }`);
        lines.push(``);

        lines.push(`    validate${rel.parentClass}(${camelCase(singular)});`);
        lines.push(``);

        // Initialize collection if needed
        lines.push(`    // Initialize ${propertyName} collection if needed`);
        lines.push(`    if (!this._${propertyName}) {`);
        lines.push(
          `      this._${propertyName} = new ${rel.parentClass}List();`,
        );
        lines.push(`    }`);
        lines.push(``);

        // Check for duplicates with better error message
        lines.push(`    // Check for duplicate ${entityName.toLowerCase()}`);
        lines.push(
          `    if (this._${propertyName}.contains(${camelCase(singular)}.${camelCase(rel.parentCol)})) {`,
        );
        lines.push(`      throw new ${className}DomainException({`);
        lines.push(
          `        ...${className}ExceptionMessage.duplicate${upperFirst(singularClass)}Error,`,
        );
        lines.push(`        message:`);
        lines.push(
          `          ${className}ExceptionMessage.duplicate${upperFirst(singularClass)}Error.message +`,
        );
        lines.push(`          ' with ${camelCase(rel.parentCol)} "' +`);
        lines.push(
          `          ${camelCase(singular)}.${camelCase(rel.parentCol)} +`,
        );
        lines.push(`          '"',`);
        lines.push(`      });`);

        lines.push(`    }`);
        lines.push(``);

        // Perform the operation
        lines.push(
          `    // Add the ${entityName.toLowerCase()} to the collection`,
        );
        lines.push(`    this._${propertyName}.add(${camelCase(singular)});`);
        lines.push(``);

        // Emit domain event
        addImport(
          imports,
          '../events',
          `${className}${upperFirst(camelCase(singular))}AddedEvent`,
        );
        lines.push(
          `    // Emit domain event for ${entityName.toLowerCase()} addition`,
        );
        lines.push(`    this.apply(`);
        lines.push(
          `      new ${className}${upperFirst(camelCase(singular))}AddedEvent(`,
        );
        lines.push(`        user,`);
        lines.push(`        this.getId(),`);
        lines.push(`        this.toDto(),`);
        lines.push(`      ),`);
        lines.push(`    );`);
        lines.push(``);

        lines.push(`    // Validate aggregate state after modification`);
        lines.push(`    this.validateState();`);
        lines.push(`  }`);
        lines.push(``);

        // Remove method with improved documentation and validation
        lines.push(`  /**`);
        lines.push(
          `   * Removes a ${sentenceCase(singularClass)} from the ${className.toLowerCase()}'s ${sentenceCase(propertyName)}.`,
        );
        lines.push(`   * Business rules:`);
        lines.push(
          `   * - The ${camelCase(rel.parentCol)} must be provided and valid`,
        );
        lines.push(
          `   * - ${className} must always have at least one ${camelCase(singular)}`,
        );
        lines.push(
          `   * - No-op if the ${sentenceCase(singularClass)} doesn't exist (idempotent operation)`,
        );
        lines.push(
          `   * - Emits ${className}${upperFirst(camelCase(singular))}RemovedEvent on success`,
        );
        lines.push(`   * @param user - The user performing the operation`);
        lines.push(
          `   * @param ${camelCase(rel.parentCol)} - The ${camelCase(rel.parentCol)} of the ${sentenceCase(singularClass)} to remove`,
        );
        lines.push(
          `   * @throws {${className}DomainException} When the ${camelCase(rel.parentCol)} is invalid or business rules are violated`,
        );
        lines.push(`   */`);
        lines.push(
          `  remove${upperFirst(singularize(camelCase(rel.childCol)))}(user: IUserToken, ${camelCase(rel.parentCol)}: ${col.type}): void {`,
        );

        // Input validation
        lines.push(`    // Validate user context`);
        lines.push(`    if (!user) {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.userRequiredFor${upperFirst(camelCase(singular))}Operations);`,
        );
        lines.push(`    }`);
        lines.push(``);

        lines.push(`    // Validate ${camelCase(rel.parentCol)} parameter`);
        lines.push(`    if (!${camelCase(rel.parentCol)}) {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.invalid${upperFirst(camelCase(rel.parentCol))}Parameter);`,
        );
        lines.push(`    }`);
        lines.push(``);

        // Check if item exists (idempotent operation)
        lines.push(
          `    // Check if ${entityName.toLowerCase()} exists (idempotent operation)`,
        );
        lines.push(
          `    if (!this._${propertyName} || !this._${propertyName}.contains(${camelCase(rel.parentCol)})) {`,
        );
        lines.push(
          `      return; // No-op if not present - idempotent operation`,
        );
        lines.push(`    }`);
        lines.push(``);
        lines.push(`
    // Business rule: ${className} must always have at least one ${singularize(propertyName)}
    if (this._${propertyName}.value.length <= 1) {
      throw new ${className}DomainException(
        ${className}ExceptionMessage.${propertyName}OneRequired,
      );
    }

`);
        // Perform the removal
        lines.push(
          `    // Remove the ${entityName.toLowerCase()} from the collection`,
        );
        lines.push(
          `    this._${propertyName} = this._${propertyName}.remove(${camelCase(rel.parentCol)});`,
        );
        lines.push(``);

        // Emit domain event
        addImport(
          imports,
          '../events',
          `${className}${upperFirst(camelCase(singular))}RemovedEvent`,
        );
        lines.push(
          `    // Emit domain event for ${entityName.toLowerCase()} removal`,
        );
        lines.push(`    this.apply(`);
        lines.push(
          `      new ${className}${upperFirst(camelCase(singular))}RemovedEvent(`,
        );
        lines.push(`        user,`);
        lines.push(`        this.getId(),`);
        lines.push(`        this.toDto(),`);
        lines.push(`      ),`);
        lines.push(`    );`);
        lines.push(``);

        lines.push(`    // Validate aggregate state after modification`);
        lines.push(`    this.validateState();`);
        lines.push(`  }`);
        lines.push(``);
        lines.push(`  /**
   * Bulk operation to manage multiple ${camelCase(entityName)} at once.
   * This provides a convenient interface for complex ${entityName} operations
   * while maintaining all business rule validation.
   * @param user - The user performing the operations
   * @param operations - The add/remove operations to perform
   */
  manage${pluralize(entityName)}InBulk(
    user: IUserToken,
    operations: {
      add?: I${entityName}[];
      remove?: ${col.type}[];
    },
  ): void {
    // Apply removals first, then additions
    // Each operation will validate business rules individually
    if (operations.remove) {
      operations.remove.forEach((code) => this.remove${upperFirst(camelCase(singularize(col.name)))}(user, code));
    }

    if (operations.add) {
      operations.add.forEach((code) => this.add${upperFirst(camelCase(singularize(col.name)))}(user, code));
    }
  }
`);
      });

    // Generate custom API methods
    const apis = schema.parameters?.[table.name]?.apis || {};
    for (const [apiId, api] of Object.entries(apis)) {
      // Derive method and event names
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );
      const eventClass = `${className}${upperFirst(methodName)}Event`;
      addImport(imports, '../events', eventClass);

      // Find params from the route (e.g., :stream)
      const paramMatches = [...apiId.matchAll(/:([a-zA-Z0-9_]+)/g)];
      const paramNames = paramMatches.map((m) => m[1]);
      const paramTypes = paramNames.map((p) =>
        api.params?.[p]?.type === 'number' ? 'number' : 'string',
      );

      // Method signature
      lines.push(
        `  ${methodName}(user: IUserToken${paramNames.length ? ', ' : ''}${paramNames.map((p, i) => `${p}: ${paramTypes[i]}`).join(', ')}): void {`,
      );
      // Business rule placeholder
      lines.push(`    // Add business rule checks here if needed`);
      // Apply event
      lines.push(
        `    this.apply(new ${eventClass}(user, this.getId(), this.toDto()));`,
      );
      lines.push(`  }`);
      lines.push('');
    }

    lines.push(`}`);
    lines.push(``);

    // Generate final file content
    const importTs = Object.entries(imports)
      .map(([key, value]) => {
        if (value.size) {
          return `import { ${Array.from(value).sort().join(', ')} } from '${key}';`;
        }
        return null;
      })
      .filter(Boolean)
      .join('\n');

    const filePath = path.join(
      outDir,
      fileBase,
      'domain',
      'aggregates',
      `${fileBase}.aggregate.ts`,
    );

    await writeFileWithDir(filePath, importTs + '\n' + lines.join('\n'));
  }

  return errors;
};

exports.create = create;
