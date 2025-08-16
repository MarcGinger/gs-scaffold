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
  pluralize,
  sentenceCase,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getUniqueRelationships,
} = require('../utils/general-utils');

/**
 * Main entry point to generate both create and update DTOs from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema) => {
  logger.info(`Starting Create/Update DTO generation...`);
  try {
    // Generate both create and update DTOs
    await Promise.all([
      await generateRouter(schema),
      await generateModule(schema),
    ]);
    logger.success(`Create/Update DTO generation completed successfully`);
  } catch (error) {
    logger.error(`Error during generation: ${error.message}`);
    throw error;
  }
};

const generateRouter = async (schema) => {
  const outDir = path.resolve(schema.sourceDirectory);

  const moduleName = upperFirst(camelCase(schema.service.module));

  const tables = Object.values(schema.tables).filter((table) => {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      return false;
    }
    return true;
  });

  const imports = [];

  addImport(imports, '@nestjs/common', 'Module');
  addImport(imports, '@nestjs/core', 'RouterModule');
  Object.values(tables).forEach((table) => {
    console.log(table.name);
    addImport(
      imports,
      `./${kebabCase(table.name)}/${kebabCase(table.name)}.module`,
      `${upperFirst(camelCase(table.name))}Module`,
    );
  });
  const lines = [];

  lines.push(`/**
 * 🏦 ${sentenceCase(schema.service.name)} Module Router
 *
 * This router organizes ${sentenceCase(schema.service.name).toLowerCase()} API endpoints by specific business capabilities
 * within the modular monolith architecture. Each route group represents a distinct
 * business capability that could potentially be extracted as a microservice.
 */`);

  lines.push(`@Module({
  imports: [
    RouterModule.register([
      {
        path: '${kebabCase(moduleName)}',
        children: [`);
  Object.values(tables).forEach((table) => {
    const className = upperFirst(camelCase(table.name));
    lines.push(
      `          { path: '${pluralize(kebabCase(table.name))}', module: ${className}Module },`,
    );
  });
  lines.push(`        ],
      },
    ]),

    // Import all active modules with controllers`);
  Object.values(tables).forEach((table) => {
    const className = upperFirst(camelCase(table.name));
    lines.push(`    ${className}Module,`);
  });

  lines.push(`  ],
})
export class ${moduleName}ModuleRouter {}`);
  lines.push(``);

  const importLines = buildImportLines(imports);

  const filePath = path.join(outDir, `routing.module.ts`);

  if (!schema.excluded?.includes(`routing.module.ts`)) {
    await writeFileWithDir(filePath, importLines + lines.join('\n'));
  }
};

const generateModule = async (schema) => {
  const outDir = path.resolve(schema.sourceDirectory);

  const moduleName = upperFirst(camelCase(schema.service.module));

  const parameters = Object.values(schema.parameters).map(
    (parameter) => parameter,
  );

  const hasOrm = parameters.some(
    (parameter) =>
      parameter.store?.read === 'sql' ||
      parameter.store?.write === 'sql' ||
      parameter.store?.list === 'sql',
  );
  const imports = [];

  addImport(imports, '@nestjs/common', 'Module');
  addImport(imports, './routing.module', `${moduleName}ModuleRouter`);
  if (hasOrm) {
    addImport(imports, '@nestjs/typeorm', `TypeOrmModule`);
    addImport(imports, 'src/shared/infrastructure', `TypeormConfigService`);
    addImport(imports, './entities.module', `EntityModule`);
  }
  const lines = [];

  lines.push(`@Module({`);
  lines.push(`  imports: [`);
  lines.push(`    ${moduleName}ModuleRouter,`);
  if (hasOrm) {
    lines.push(
      `    TypeOrmModule.forRootAsync({ useClass: TypeormConfigService }),`,
    );
    lines.push(`    EntityModule,`);
  }

  lines.push(`  ],`);
  lines.push(`})`);
  lines.push(`export class ${moduleName}Module {}`);
  lines.push(``);

  const importLines = buildImportLines(imports);

  const filePath = path.join(outDir, `module.ts`);

  if (!schema.excluded?.includes(`module.ts`)) {
    await writeFileWithDir(filePath, importLines + lines.join('\n'));
  }
};

module.exports = { create };
