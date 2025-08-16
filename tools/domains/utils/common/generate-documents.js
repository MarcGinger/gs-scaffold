#!/usr/bin/env node
/**
 * generate-update-request-dtos.js
 *
 * A Node.js script to generate NestJS Create and Update Request DTOs
 * from a cleaned JSON schema, using the decorator functions we've created.
 *
 * - All DTO files will be in src/dtos/<entity>/
 * - Creates both CreateRequest and UpdateRequest DTOs
 */
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
  logger.info('Starting Create/Update DTO generation...');
  try {
    // Generate both create and update DTOs
    await Promise.all([
      await generateDocuments(schema),
      await generateModuleDocument(schema),
    ]);
    logger.success('Create/Update DTO generation completed successfully');
  } catch (error) {
    logger.error(`Error during generation: ${error.message}`);
    throw error;
  }
};

/**
 * Uses lines.push and addImport patterns like generateCreateDtos
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateDocuments = async (schema) => {
  const outDir = path.resolve(schema.sourceDirectory);

  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Permissions generation...`);

  const serviceModule = kebabCase(singularize(schema.service.module));

  const tableHasModule = (schema, tableName) => {
    let hasModule = true;
    const table = Object.values(tables).find(
      (table) => table.name === tableName,
    );
    if (!table) {
      return false;
    }
    if (shouldSkipTable(table, schema)) {
      return false;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      return false;
    }
    return true;
  };

  for (const [tableId, table] of Object.entries(tables)) {
    try {
      const name = table.name;
      const className = upperFirst(camelCase(name));
      const kebabName = kebabCase(name);

      let hasModule = tableHasModule(schema, table.name);

      const imports = [];

      addImport(imports, '@nestjs/swagger', [
        'DocumentBuilder',
        'SwaggerModule',
      ]);
      addImport(imports, '@nestjs/common', ['INestApplication']);
      addImport(imports, 'src/docs/swagger-config.util', ['SwaggerConfigUtil']);

      if (hasModule) {
        addImport(imports, `../${kebabCase(singularize(className))}.module`, [
          `${className}Module`,
        ]);
      }

      const modules = table._relationships
        .filter((rel) => rel.isChild)
        .filter((relationship) =>
          tableHasModule(schema, relationship.parentTable),
        );
      modules.forEach((relationship) => {
        addImport(
          imports,
          `../../${kebabCase(relationship.parentTable)}/${kebabCase(relationship.parentTable)}.module`,
          [`${upperFirst(camelCase(relationship.parentTable))}Module`],
        );
      });

      // Collect unique childTable and parentTable names from relationships
      const documentList = Array.from(
        new Set(
          table._relationships
            .flatMap((rel) => [rel.childTable, rel.parentTable])
            .filter((tbl) => tbl !== table.name),
        ),
      );

      const descriptionLinks = [];

      const parentDocuments = Array.from(
        new Set(
          table._relationships
            .filter((rel) => rel.isParent)
            .filter((tbl) => tbl !== table.name)
            .map((relationship) => relationship.childTable),
        ),
      );
      if (parentDocuments.length) {
        descriptionLinks.push(`## Parent Documentation`);
        descriptionLinks.push(`| Parent | Description | Documentation Link |`);
        descriptionLinks.push(`|--------|-------------|-------------------|`);
        parentDocuments.forEach((relationship) => {
          descriptionLinks.push(
            `| **🔄 ${upperFirst(sentenceCase(pluralize(relationship)))}** | ${schema.parameters[relationship]?.docs?.summary?.replace(/`/g, '\\`') || 'No description available'} | [📖 View Docs](/api/docs/${serviceModule}/${kebabCase(pluralize(relationship))}) |`,
          );
        });
      }

      descriptionLinks.push(`## Module Documentation`);
      if (modules.length) {
        descriptionLinks.push(`| Module | Description | Documentation Link |`);
        descriptionLinks.push(`|--------|-------------|-------------------|`);
        modules.forEach((relationship) => {
          descriptionLinks.push(
            `| **🔄 ${upperFirst(sentenceCase(pluralize(relationship.parentTable)))}** | ${schema.parameters[relationship.parentTable]?.docs?.summary?.replace(/`/g, '\\`') || 'No description available'} | [📖 View Docs](/api/docs/${serviceModule}/${kebabCase(pluralize(relationship.parentTable))}) |`,
          );
        });
      }

      // childrenDocuments: all child relationships whose parentTable is NOT in modules

      const childrenDocuments = Array.from(
        new Set(
          table._relationships
            .filter(
              (relationship) =>
                !tableHasModule(schema, relationship.parentTable),
            )
            .filter((rel) => rel.isChild)
            .filter((tbl) => tbl !== table.name)

            .map((relationship) => relationship.parentTable),
        ),
      );

      if (childrenDocuments.length) {
        descriptionLinks.push(`## Children Documentation`);
        descriptionLinks.push(`| Child | Description | Documentation Link |`);
        descriptionLinks.push(`|--------|-------------|-------------------|`);
        childrenDocuments.forEach((relationship) => {
          descriptionLinks.push(
            `| **🔄 ${upperFirst(sentenceCase(pluralize(relationship)))}** | ${schema.parameters[relationship]?.docs?.summary?.replace(/`/g, '\\`') || 'No description available'} | [📖 View Docs](/api/docs/${serviceModule}/${kebabCase(pluralize(relationship))}) |`,
          );
        });
      }
      // Permissions lines
      const lines = [];

      lines.push(`/**`);
      lines.push(` * ${className} Documentation`);
      lines.push(
        ` * This module handles the Swagger documentation for ${camelCase(pluralize(className))}`,
      );
      lines.push(
        ` * including digital ${camelCase(pluralize(className))}, physical touchpoints, and API access methods.`,
      );
      lines.push(` */`);
      lines.push(`export class ${className}Documentation {`);
      lines.push(
        `  static setup(app: INestApplication, port: string | number): void {`,
      );
      lines.push(`    const config = new DocumentBuilder()`);
      lines.push(`      .addBearerAuth(`);
      lines.push(
        `        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },`,
      );
      lines.push(`        'bearer',`);
      lines.push(`      )`);
      lines.push(`      .setTitle('📱 ${className} Management API')`);

      lines.push(`      .setDescription(\``);

      lines.push(...descriptionLinks);
      lines.push(
        (table.desc || 'No description available').replace(/`/g, '\\`'),
      );
      lines.push(`\``);
      lines.push(`      )
      .setVersion('1.0')`);
      if (hasModule) {
        lines.push(
          `      .addTag('${upperFirst(sentenceCase(pluralize(name)))}', '${schema.parameters[table.name]?.docs?.summary?.replace(/`/g, '\\`') || 'No description available'}')`,
        );
      }

      const includeModules = modules.map(
        (relationship) =>
          `${upperFirst(camelCase(relationship.parentTable))}Module`,
      );
      if (hasModule) {
        includeModules.unshift(`${className}Module`);
      }
      const includelines = includeModules.join(', ');

      const extraModels = [];
      table._relationships.forEach((relationship) => {
        if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
          const col = table.cols.find(
            (col) =>
              col.name === relationship.childCol &&
              col.datatype === 'JSON' &&
              col.defaultvalue === 'object()',
          );

          if (col) {
            extraModels.push(relationship.parentTable);
          }
        }
      });

      extraModels.forEach((model) => {
        addImport(imports, `../../${kebabCase(model)}/application/dtos`, [
          `${upperFirst(camelCase(model))}Response`,
          `${upperFirst(camelCase(model))}UpdateRequest`,
        ]);
      });
      console.log(extraModels);
      lines.push(``);
      lines.push(`    // Add dynamic server configuration`);
      lines.push(`    SwaggerConfigUtil.addServers(config, port);`);
      lines.push(``);
      lines.push(
        `    const document = SwaggerModule.createDocument(app, config.build(), {`,
      );
      lines.push(`      include: [${includelines}],`);
      if (extraModels.length) {
        lines.push(
          `      extraModels: [${extraModels
            .map(
              (model) =>
                `${upperFirst(camelCase(model))}Response, ${upperFirst(camelCase(model))}UpdateRequest`,
            )
            .join(', ')}],`,
        );
      }
      lines.push(`    });`);

      // documentList.forEach((relationship) => {
      //   lines.push(
      //     `    ${upperFirst(camelCase(relationship))}Documentation.setup(app, port);`,
      //   );
      // });
      if (!hasModule) {
        lines.push(`    // Manually clear any accidentally included paths to ensure only documentation content
    document.paths = {};

    // Clear any business domain schemas and add only infrastructure schemas
    document.components = document.components || {};
    document.components.schemas = {
      // Only include infrastructure/platform schemas - no business domain schemas
    };
`);
      }
      lines.push(`
    SwaggerModule.setup('api/docs/${serviceModule}/${kebabCase(pluralize(className))}', app, document);
  }

  static getEndpoint(port: string | number): string {
    return \`\${SwaggerConfigUtil.getServerUrl(port)}/api/docs/${serviceModule}/${kebabCase(pluralize(className))}\`;
  }
`);

      const apis = schema.parameters[table.name]?.apis || {};

      // ...existing code...
      for (const [apiId, api] of Object.entries(apis)) {
        // Determine HTTP method decorator
        // Build method name (e.g., resetStream)
        const methodName = camelCase(
          apiId
            .replace(/[:/]/g, ' ')
            .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
            .replace(/\s/g, ''),
        );
      }

      lines.push('}');
      lines.push('');

      // Build import statements

      const documentFile = path.join(
        outDir,
        kebabName,
        'docs',
        `${kebabName}.doc.ts`,
      );

      if (schema.excluded?.includes(`${kebabName}.doc.ts`)) {
        logger.info(
          `Skipping generation of ${kebabName}.doc.ts as it is excluded.`,
        );
      } else {
        await writeFileWithDir(
          documentFile,
          buildImportLines(imports) + '\n\n' + lines.join('\n'),
        );
        logger.success(`Created Document: ${documentFile}`);
      }
    } catch (error) {
      console.error(error);
    }
  }
};

const generateModuleDocument = async (schema) => {
  const outDir = path.resolve(schema.sourceDirectory);

  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Permissions generation...`);

  const serviceModule = kebabCase(singularize(schema.service.module));

  const tableHasModule = (schema, tableName) => {
    let hasModule = true;
    const table = Object.values(tables).find(
      (table) => table.name === tableName,
    );
    if (!table) {
      return false;
    }
    if (shouldSkipTable(table, schema)) {
      return false;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      return false;
    }
    return true;
  };

  const imports = [];

  addImport(imports, '@nestjs/swagger', ['DocumentBuilder', 'SwaggerModule']);
  addImport(imports, '@nestjs/common', ['INestApplication']);
  addImport(imports, 'src/docs/swagger-config.util', ['SwaggerConfigUtil']);

  const moduleList = Object.values(tables).filter((table) =>
    tableHasModule(schema, table.name),
  );

  const objectList = Object.values(tables).filter(
    (table) => !tableHasModule(schema, table.name),
  );

  for (const [tableId, table] of Object.entries(tables)) {
    if (tableHasModule(schema, table.name)) {
      addImport(
        imports,
        `./${kebabCase(singularize(upperFirst(camelCase(table.name))))}/${kebabCase(singularize(upperFirst(camelCase(table.name))))}.module`,
        [`${upperFirst(camelCase(table.name))}Module`],
      );
    }
    addImport(
      imports,
      `./${kebabCase(camelCase(table.name))}/docs/${kebabCase(
        upperFirst(camelCase(table.name)),
      )}.doc`,
      [`${upperFirst(camelCase(table.name))}Documentation`],
    );
    const name = table.name;
    const className = upperFirst(camelCase(name));
    const kebabName = kebabCase(name);

    // Build import statements
  }

  const descriptionLinks = [];

  if (moduleList.length) {
    descriptionLinks.push(`## Linked Modules Documentation`);
    descriptionLinks.push(`| Module | Description | Documentation Link |`);
    descriptionLinks.push(`|------|-------------|-------------------|`);
    moduleList.forEach((table) => {
      descriptionLinks.push(
        `| **🔄 ${upperFirst(sentenceCase(pluralize(table.name)))}** | ${schema.parameters[table.name]?.docs?.summary?.replace(/`/g, '\\`') || 'No description available'} | [📖 View Docs](/api/docs/${serviceModule}/${kebabCase(pluralize(table.name))}) |`,
      );
    });
  }

  if (objectList.length) {
    descriptionLinks.push(`## Complex Objects Documentation`);
    descriptionLinks.push(`| Module | Description | Documentation Link |`);
    descriptionLinks.push(`|------|-------------|-------------------|`);
    objectList.forEach((table) => {
      descriptionLinks.push(
        `| **🔄 ${upperFirst(sentenceCase(pluralize(table.name)))}** | ${schema.parameters[table.name]?.docs?.summary || 'No description available'} | [📖 View Docs](/api/docs/${serviceModule}/${kebabCase(pluralize(table.name))}) |`,
      );
    });
  }

  const lines = [];

  lines.push(`/**
 * ${schema.service.name} Module Documentation
 * This module handles the Swagger documentation for the comprehensive banking product platform
 * including all core banking capabilities and business modules.
 */
export class ${upperFirst(camelCase(serviceModule))}Documentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .setTitle('${schema.service.name} Platform')
      .setDescription(\`
        `);
  lines.push(...descriptionLinks);
  lines.push(
    (schema.model.desc || 'No description available').replace(/`/g, '\\`'),
  );
  lines.push(`\`,`);
  lines.push(`      )
      .setVersion('1.0')`);
  for (const [tableId, table] of Object.entries(tables)) {
    lines.push(
      `      .addTag('${upperFirst(sentenceCase(pluralize(table.name)))}', '${schema.parameters[table.name]?.docs?.summary || 'No description available'}')`,
    );
  }
  lines[lines.length - 1] += `;`;
  // Add dynamic server configuration
  lines.push(`    SwaggerConfigUtil.addServers(config, port);

    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [`);
  for (const [tableId, table] of Object.entries(tables)) {
    if (tableHasModule(schema, table.name)) {
      lines.push(`        ${upperFirst(camelCase(table.name))}Module,`);
    }
  }

  lines.push(`      ],
    });
`);
  lines.push(``);
  lines.push(
    `    SwaggerModule.setup('api/docs/${kebabCase(serviceModule)}', app, document);`,
  );
  lines.push(``);
  for (const [tableId, table] of Object.entries(tables)) {
    // if (tableHasModule(schema, table.name)) {
    // } else {
    lines.push(
      `    ${upperFirst(camelCase(table.name))}Documentation.setup(app, port);`,
    );
    // }
  }

  lines.push(`  }

  static getEndpoint(port: string | number): string {
    return \`\${SwaggerConfigUtil.getServerUrl(port)}/api/docs/${kebabCase(serviceModule)}\`;
  }
}
`);

  for (const [tableId, table] of Object.entries(tables)) {
    const name = table.name;
    const className = upperFirst(camelCase(name));
    const kebabName = kebabCase(name);

    // Build import statements
  }
  const documentFile = path.join(outDir, `module.doc.ts`);

  if (schema.excluded?.includes(`module.doc.ts`)) {
    logger.info(`Skipping generation of module.doc.ts as it is excluded.`);
  } else {
    await writeFileWithDir(
      documentFile,
      buildImportLines(imports) + '\n\n' + lines.join('\n'),
    );
    logger.success(`Created Document: ${documentFile}`);
  }
};

// Export the main entry point
module.exports = { create };
