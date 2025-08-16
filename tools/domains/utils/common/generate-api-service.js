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
const { logger, defaultConfig, addImport } = require('../utils/general-utils');

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
    await Promise.all([await generateService(schema, finalConfig)]);
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
const generateService = async (schema, config) => {
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
    const serviceClass = `${className}ApplicationService`;
    const imports = {};

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

    addImport(imports, '@nestjs/common', 'Injectable');

    if (hasQuery) {
      addImport(imports, '@nestjs/cqrs', 'QueryBus');
    }
    if (hasCommand) {
      addImport(imports, '@nestjs/cqrs', 'CommandBus');
    }
    addImport(imports, 'src/shared/auth', 'IUserToken');
    // You may want to add more imports for commands/queries/entities as needed

    // Service lines
    const lines = [`// generate-api-service`];
    lines.push(``);
    lines.push(`@Injectable()`);
    lines.push(`export class ${serviceClass} {`);
    lines.push(`  constructor(`);
    if (hasCommand) {
      lines.push(`    private readonly commandBus: CommandBus,`);
    }
    if (hasQuery) {
      lines.push(`    private readonly queryBus: QueryBus,`);
    }
    lines.push(`  ) {}`);
    lines.push(``);

    // list
    if (idxCols.length > 0) {
      addImport(imports, '../../domain/properties', [
        `List${className}PropsOptions`,
        `${className}Page`,
      ]);
      addImport(imports, '../../application/queries', `List${className}Query`);
      lines.push(`  async list(`);
      lines.push(`    user: IUserToken,`);
      lines.push(`    pageOptions?: List${className}PropsOptions,`);
      lines.push(`  ): Promise<${className}Page> {`);
      lines.push(
        `    const options: List${className}PropsOptions = pageOptions || {};`,
      );
      lines.push(`    return await this.queryBus.execute<`);
      lines.push(`      List${className}Query,`);
      lines.push(`      ${className}Page`);
      lines.push(`    >(new List${className}Query(user, options));`);
      lines.push(`  }`);
      lines.push(``);
    }
    // get
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      addImport(imports, '../../application/queries', `Item${className}Query`);
      addImport(imports, '../../domain/entities', `I${className}`);
      lines.push(
        `  async get(user: IUserToken, ${keys.map((k) => camelCase(k.name) + `: ${k.type}`).join(', ')}): Promise<I${className}> {`,
      );
      lines.push(
        `    return this.queryBus.execute(new Item${className}Query(user, ${keys.map((k) => camelCase(k.name)).join(', ')}));`,
      );
      lines.push(`  }`);
      lines.push(``);
    }
    // getMultiple
    if (!schema.parameters?.[table.name]?.cancel?.batch) {
      if (keys.length === 1) {
        const key = keys[0];
        addImport(
          imports,
          '../../application/queries',
          `Multiple${className}Query`,
        );
        addImport(imports, '../../domain/entities', `I${className}`);
        lines.push(`  async getMultiple(`);
        lines.push(`    user: IUserToken,`);
        lines.push(`    ${camelCase(pluralize(key.name))}: ${key.type}[],`);
        lines.push(`  ): Promise<I${className}[]> {`);
        lines.push(`    return this.queryBus.execute(`);
        lines.push(
          `      new Multiple${className}Query(user, ${camelCase(pluralize(key.name))}),`,
        );
        lines.push(`    );`);
        lines.push(`  }`);
        lines.push(``);
      }
    }

    // create
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      addImport(imports, '../../application/commands', [
        `Create${className}Command`,
      ]);
      addImport(imports, '../../domain/entities', [`I${className}`]);

      addImport(imports, '../../domain/properties', [
        `Create${className}Props`,
      ]);

      lines.push(`  async create(`);
      lines.push(`    user: IUserToken,`);
      lines.push(`    dto: Create${className}Props,`);
      lines.push(`  ): Promise<I${className}> {`);
      lines.push(`    const entity = await this.commandBus.execute<`);
      lines.push(`      Create${className}Command,`);
      lines.push(`      I${className}`);
      lines.push(`    >(new Create${className}Command(user, dto));`);
      lines.push(`    return entity;`);
      lines.push(`  }`);
    }
    // update
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      addImport(imports, '../../application/commands', [
        `Update${className}Command`,
      ]);
      addImport(imports, '../../domain/entities', [`I${className}`]);

      addImport(imports, '../../domain/properties', [
        `Update${className}Props`,
      ]);
      lines.push(
        `  async update(user: IUserToken, ${keys.map((k) => camelCase(k.name) + `: ${k.type}`).join(', ')}, dto: Update${className}Props): Promise<I${className}> {`,
      );
      lines.push(`    const entity = await this.commandBus.execute<`);
      lines.push(`      Update${className}Command,`);
      lines.push(`      I${className}`);
      lines.push(
        `    >(new Update${className}Command(user, ${keys.map((k) => camelCase(k.name)).join(', ')}, dto));`,
      );
      lines.push(`    return entity;`);
      lines.push(`  }`);
      lines.push(``);
    }
    // delete
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      addImport(imports, '../../application/commands', [
        `Delete${className}Command`,
      ]);
      addImport(imports, '../../domain/entities', [`I${className}`]);
      lines.push(
        `  async delete(user: IUserToken, ${keys.map((k) => camelCase(k.name) + `: ${k.type}`).join(', ')}): Promise<I${className}> {`,
      );
      lines.push(`    const entity = await this.commandBus.execute<`);
      lines.push(`      Delete${className}Command,`);
      lines.push(`      I${className}`);
      lines.push(
        `    >(new Delete${className}Command(user, ${keys.map((k) => camelCase(k.name)).join(', ')}));`,
      );
      lines.push(``);
      lines.push(`    return entity;`);
      lines.push(`  }`);
      lines.push(``);
    }

    // enable/disable/status if present
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      if (table.cols.some((col) => col.name === 'enabled')) {
        addImport(imports, '../../application/commands', [
          `Enable${className}Command`,
        ]);
        addImport(imports, '../../domain/entities', [`I${className}`]);
        lines.push(
          `  async enable(user: IUserToken, ${keys.map((k) => camelCase(k.name) + `: ${k.type}`).join(', ')}): Promise<I${className}> {`,
        );
        lines.push(`    const entity = await this.commandBus.execute<`);
        lines.push(`      Enable${className}Command,`);
        lines.push(`      I${className}`);
        lines.push(
          `    >(new Enable${className}Command(user, ${keys.map((k) => camelCase(k.name)).join(', ')}));`,
        );
        lines.push(``);
        lines.push(`    return entity;`);
        lines.push(`  }`);
        lines.push(``);

        addImport(imports, '../../application/commands', [
          `Disable${className}Command`,
        ]);
        addImport(imports, '../../domain/entities', [`I${className}`]);
        lines.push(
          `  async disable(user: IUserToken, ${keys.map((k) => camelCase(k.name) + `: ${k.type}`).join(', ')}): Promise<I${className}> {`,
        );
        lines.push(`    const entity = await this.commandBus.execute<`);
        lines.push(`      Disable${className}Command,`);
        lines.push(`      I${className}`);
        lines.push(
          `    >(new Disable${className}Command(user, ${keys.map((k) => camelCase(k.name)).join(', ')}));`,
        );
        lines.push(``);
        lines.push(`    return entity;`);
        lines.push(`  }`);
        lines.push(``);
      }
      if (
        table.cols.some(
          (col) => col.name === 'status' && col.datatype === 'ENUM',
        )
      ) {
        addImport(imports, '../../domain/entities', [`${className}StatusEnum`]);
        addImport(imports, '../../application/commands', [
          `Update${className}StatusCommand`,
        ]);
        lines.push(
          `  async updateStatus(user: IUserToken, ${keys.map((k) => camelCase(k.name) + `: ${k.type}`).join(', ')}, status: ${className}StatusEnum): Promise<I${className}> {`,
        );
        lines.push(`    const entity = await this.commandBus.execute<`);
        lines.push(`      Update${className}StatusCommand,`);
        lines.push(`      I${className}`);
        lines.push(
          `    >(new Update${className}StatusCommand(user, ${keys.map((k) => camelCase(k.name)).join(', ')}, status));`,
        );

        lines.push(`    return entity;`);
        lines.push(`  }`);
        lines.push(``);
      }

      table._relationships.forEach((relation) => {
        if (
          relation.c_ch === 'many' &&
          relation.c_p === 'many' &&
          relation.parent !== table.name
        ) {
          const col = table.cols.find((col) => col.name === relation.childCol);
          if (!col) {
            logger.warn(
              `Skipping relation ${relation.childCol} in ${table.name} as it does not exist.`,
            );
            return;
          }

          if (col.datatype !== 'JSON') {
            const childBase = upperFirst(
              camelCase(singularize(relation.childCol)),
            );
            const childKey = `${camelCase(childBase)}${upperFirst(camelCase(relation.parentCol))}`;
            addImport(imports, '../../application/commands', [
              `Add${childBase}To${className}Command`,
              `Remove${childBase}From${className}Command`,
            ]);
            lines.push(`  async add${childBase}(`);
            lines.push(`    user: IUserToken,`);
            keys.forEach((key) => {
              lines.push(`      ${camelCase(key.name)}: ${key.type},`);
            });
            lines.push(`    ${childKey}: ${col.type},`);
            lines.push(`  ): Promise<I${className}> {`);
            lines.push(`    const entity = await this.commandBus.execute<`);
            lines.push(`      Add${childBase}To${className}Command,`);
            lines.push(`      I${className}`);
            lines.push(
              `    >(new Add${childBase}To${className}Command(user, ${keys.map((key) => camelCase(key.name)).join(', ')}, ${childKey}));`,
            );
            lines.push(``);
            lines.push(`    return entity;`);
            lines.push(`  }`);
            lines.push(``);
            lines.push(`  async remove${childBase}(`);
            lines.push(`    user: IUserToken,`);
            keys.forEach((key) => {
              lines.push(`      ${camelCase(key.name)}: ${key.type},`);
            });
            lines.push(`    ${childKey}: ${col.type},`);
            lines.push(`  ): Promise<I${className}> {`);
            lines.push(`    const entity = await this.commandBus.execute<`);
            lines.push(`      Remove${childBase}From${className}Command,`);
            lines.push(`      I${className}`);
            lines.push(
              `    >(new Remove${childBase}From${className}Command(user, ${keys.map((key) => camelCase(key.name)).join(', ')}, ${childKey}));`,
            );
            lines.push(``);
            lines.push(`    return entity;`);
            lines.push(`  }`);
          }
        }
      });
    }
    const apis = schema.parameters[table.name]?.apis || {};

    // ...existing code...
    for (const [apiId, api] of Object.entries(apis)) {
      // Determine HTTP method decorator
      // Determine method name from apiId (e.g., reset/:stream -> resetProjectionStream)
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );

      // Build params from route (e.g., :stream)
      const paramMatches = [...apiId.matchAll(/:([a-zA-Z0-9_]+)/g)];
      const paramNames = paramMatches.map((m) => m[1]);
      const paramTypes = paramNames.map((p) =>
        api.params?.[p]?.type === 'number' ? 'number' : 'string',
      );

      // Add imports for command and domain if not already present
      const commandClass = `${upperFirst(methodName)}${className}Command`;
      addImport(imports, '../../application/commands', [commandClass]);
      addImport(imports, '../../domain/entities', [`I${className}`]);

      // Generate method signature
      lines.push(`  async ${methodName}(`);
      lines.push(`    user: IUserToken,`);
      paramNames.forEach((p, i) => {
        lines.push(`    ${p}: ${paramTypes[i]},`);
      });
      lines.push(`  ): Promise<I${className}> {`);
      lines.push(`    const entity = await this.commandBus.execute<`);
      lines.push(`      ${commandClass},`);
      lines.push(`      I${className}`);
      lines.push(
        `    >(new ${commandClass}(user${paramNames.length ? ', ' + paramNames.join(', ') : ''}));`,
      );
      lines.push(`    return entity;`);
      lines.push(`  }`);
      lines.push('');
      lines.push('');
    }

    lines.push(`}`);
    lines.push(``);

    // Build import statements
    const importLines = buildImportLines(imports);
    const serviceFile = path.join(
      outDir,
      kebabName,
      'application',
      'services',
      `${kebabName}-application.service.ts`,
    );
    if (schema.excluded?.includes(`${kebabName}-application.service.ts`)) {
      logger.info(
        `Skipping generation of ${kebabName}-application.service.ts as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(serviceFile, importLines + '\n' + lines.join('\n'));
    logger.success(`Created Service: ${serviceFile}`);
  }
};

module.exports = { create };
