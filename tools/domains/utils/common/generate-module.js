const path = require('path');
const { writeFileWithDir } = require('../utils/file-utils');
const {
  buildImportLines,
  shouldSkipTable,
  isJoinTableValid,
} = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  snakeCase,
  singularize,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getUniqueRelationships,
} = require('../utils/general-utils');

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
 * Main entry point to generate both create and update DTOs from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info(`Starting Create/Update DTO generation...`);
  try {
    // Generate both create and update DTOs
    await Promise.all([await generateModule(schema, finalConfig)]);
    logger.success(`Create/Update DTO generation completed successfully`);
  } catch (error) {
    logger.error(`Error during generation: ${error.message}`);
    throw error;
  }
};

/**
 * Generate a NestJS service from a template (transactional-fee.service.ts)
 * Uses lines.push and addImport patterns like generate-api-controller.js
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateModule = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Service generation...`);

  for (const [tableId, table] of Object.entries(tables)) {
    if (shouldSkipTable(table, schema)) {
      logger.warn(`Skipping table ${tableId} due to skip logic.`);
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }

    const name = table.name;
    const className = upperFirst(camelCase(name));
    const kebabName = kebabCase(name);

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);

    const hasQuery =
      !schema.parameters?.[table.name]?.cancel?.get || idxCols.length > 0;
    const hasCommand =
      !schema.parameters?.[table.name]?.cancel?.create ||
      !schema.parameters?.[table.name]?.cancel?.update ||
      !schema.parameters?.[table.name]?.cancel?.delete ||
      Object.keys(schema.parameters?.[table.name]?.apis).length;

    let hasEventStream =
      schema.parameters?.[table.name]?.store?.read === 'eventstream' ||
      schema.parameters?.[table.name]?.store?.write === 'eventstream';
    let hasRedis =
      schema.parameters?.[table.name]?.store?.read === 'redis' ||
      schema.parameters?.[table.name]?.store?.write === 'redis' ||
      schema.parameters?.[table.name]?.store?.list === 'redis';
    if (!hasRedis) {
      getUniqueRelationships(schema, table).forEach((relation) => {
        if (schema.parameters[relation.parentTable]?.store?.read === 'redis') {
          hasRedis = true;
        }
      });
    }
    if (!hasEventStream) {
      table._relationships.forEach((rel) => {
        const parentTable = Object.values(schema.tables).find(
          (t) => t.name === rel.parentTable,
        );
        if (
          parentTable &&
          (schema.parameters?.[parentTable.name]?.store?.write ===
            'eventstream' ||
            schema.parameters?.[parentTable.name]?.store?.read ===
              'eventstream')
        ) {
          hasEventStream = true;
        }
      });
    }

    const complexObjects = [];
    table._relationships
      .map((rel) => {
        const column = Object.values(schema.tables)
          .find((t) => t.name === rel.childTable)
          ?.cols.find((c) => c.name === rel.childCol);
        return { ...rel, column };
      })
      .forEach((relation) => {
        const col = table.cols.find((c) => c.name === relation.childCol);
        if (!col) {
          return;
        }
        if (col.datatype === 'JSON' && col.defaultvalue === 'object()') {
          return;
        }
        if (col.datatype === 'JSON') {
          const tableRelation = Object.values(schema.tables).find(
            (t) => t.name === relation.parentTable,
          );
          if (tableRelation) {
            tableRelation._relationships.forEach((rel) => {
              const cc = tableRelation.cols.find(
                (c) => c.name === rel.childCol && c.datatype !== 'JSON',
              );
              if (cc) {
                // Handle complex object relationships
                if (
                  !complexObjects.find((obj) => obj.key === camelCase(col.name))
                ) {
                  if (relation.c_p === 'many' && relation.c_ch === 'many') {
                    complexObjects.push({
                      key: camelCase(col.name),
                      function: `get${upperFirst(camelCase(pluralize(relation.parentClass)))}`,
                      table: relation.parentTable,
                    });
                  } else {
                    complexObjects.push({
                      key: camelCase(col.name),
                      function: `get${upperFirst(camelCase(singularize(relation.parentClass)))}`,
                      table: relation.parentTable,
                    });
                  }
                }
              }
            });
          }
        }
      });

    complexRelationships = [];
    complexObjects.forEach((complexObject) => {
      const complexTable = Object.values(schema.tables).find(
        (t) => t.name === complexObject.table,
      );

      if (!complexTable) {
        return;
      }
      const primary = complexTable.cols.find(
        (c) => c.pk && c.datatype === 'JSON',
      );

      if (primary) {
        complexTable._relationships.forEach((rel) => {
          if (rel.childTable === complexTable.name) {
            console.log(rel);
            complexRelationships.push(rel);
          }
        });
      }
    });

    const projectorType = getProjectionType(schema, table);

    let hasProjector = projectorType ? true : false;
    const projector = `${className}${upperFirst(projectorType)}Projection`;

    // --- EXPLICIT IMPORTS ---
    const imports = [];
    addImport(imports, '@nestjs/common', 'Module');
    addImport(imports, 'src/shared/logger', 'LoggerModule');
    if (hasRedis) {
      addImport(imports, 'src/shared/infrastructure', 'RedisConfigModule');
    }
    if (hasEventStream) {
      addImport(imports, 'src/shared/infrastructure', 'EventStoreSharedModule');
    } else {
      addImport(imports, 'src/shared/shared.module', 'SharedModule');
    }
    addImport(imports, `./domain/exceptions`, `${className}ExceptionMessage`);
    if (hasCommand) {
      addImport(imports, `./domain/services`, [`${className}DomainService`]);
    }
    if (hasQuery) {
      addImport(imports, `./application/queries`, `${className}Query`);
    }
    if (hasCommand) {
      addImport(imports, `./application/commands`, `${className}Commands`);
      addImport(imports, `./application/usecases`, `${className}UseCases`);
    }

    addImport(imports, `./application/services`, [
      `${className}ApplicationService`,
    ]);
    addImport(imports, `./infrastructure/repositories`, [
      `${className}Repository`,
    ]);
    addImport(imports, `./infrastructure/controllers`, [
      `${className}Controller`,
    ]);

    if (hasProjector) {
      addImport(imports, `./infrastructure/projectors`, [
        projector,
        `${className}ProjectionManager`,
      ]);
    }

    // --- MODULE LINES ---
    const lines = [];

    lines.push(`@Module({`);
    lines.push(`  imports: [`);

    if (hasEventStream) {
      lines.push(`    EventStoreSharedModule,`);
    } else {
      lines.push(`    SharedModule,`);
    }
    lines.push(`    LoggerModule,`);
    if (hasRedis) {
      lines.push(`    RedisConfigModule,`);
    }

    getUniqueRelationships(schema, table).forEach((relation) => {
      if (
        isJoinTableValid(
          schema.parameters[relation.parentTable]?.store,
          schema.parameters[relation.childTable]?.store,
        )
      ) {
      } else {
        addImport(
          imports,
          `../${kebabCase(singularize(relation.parentClass))}/${kebabCase(singularize(relation.parentClass))}.module`,
          `${upperFirst(camelCase(relation.parentClass))}Module`,
        );

        lines.push(`    ${upperFirst(camelCase(relation.parentClass))}Module,`);
      }
    });
    complexRelationships.forEach((relation) => {
      addImport(
        imports,
        `../${kebabCase(relation.parentTable)}/${kebabCase(singularize(relation.parentClass))}.module`,
        [`${upperFirst(camelCase(relation.parentTable))}Module`],
      );

      lines.push(`    ${upperFirst(camelCase(relation.parentTable))}Module,`);
    });

    lines.push(`  ],`);

    lines.push(`  controllers: [${className}Controller],`);
    lines.push(`  providers: [`);
    if (hasCommand) {
      lines.push(`    ${className}DomainService,`);
    }
    lines.push(`    ${className}Repository,`);
    lines.push(`    ${className}ApplicationService,`);
    lines.push(``);
    if (hasQuery) {
      lines.push(`    ...${className}Query,`);
    }
    if (hasCommand) {
      lines.push(`    ...${className}Commands,`);
      lines.push(`    ...${className}UseCases,`);
    }
    lines.push(`    {`);
    lines.push(
      `      provide: '${snakeCase(className).toUpperCase()}_EXCEPTION_MESSAGES',`,
    );
    lines.push(`      useValue: ${className}ExceptionMessage,`);
    lines.push(`    },`);

    if (hasProjector) {
      lines.push(``);
      lines.push(`    ${projector},`);
      lines.push(`    ${className}ProjectionManager,`);
      lines.push(`    {`);
      lines.push(`      provide: '${projector}',`);
      lines.push(`      useExisting: ${projector},`);
      lines.push(`    },`);
    }
    lines.push(`  ],`);
    lines.push(`  exports: [`);
    lines.push(`    ${className}Repository,`);
    if (hasProjector) {
      lines.push(`    ${projector},`);
      lines.push(`    ${className}ProjectionManager,`);
      lines.push(`    '${projector}',`);
    }
    lines.push(`  ],`);
    lines.push(`})`);
    lines.push(`export class ${className}Module {}`);
    lines.push('');

    // Build import statements
    const importLines = buildImportLines(imports);
    const serviceFile = path.join(outDir, kebabName, `${kebabName}.module.ts`);
    if (schema.excluded?.includes(`${kebabName}.module.ts`)) {
      logger.info(
        `Skipping generation of ${kebabName}.module.ts as it is excluded.`,
      );
    } else {
      await writeFileWithDir(
        serviceFile,
        importLines + '\n' + lines.join('\n'),
        true,
      );
      logger.success(`Created Service: ${serviceFile}`);
    }
  }
};

module.exports = { create };
