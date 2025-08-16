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
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
} = require('../utils/file-utils');
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
    await Promise.all([await generateController(schema, finalConfig)]);
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
const generateController = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Controller generation...`);

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

    const permissionConfig = schema.parameters?.[table.name].permissions || {
      enabled: true,
    };

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

    const name = table.name;
    const className = upperFirst(camelCase(name));
    const kebabName = kebabCase(name);
    const controllerClass = `${className}Controller`;
    const serviceClass = `${className}ApplicationService`;
    const imports = {};
    // Common imports
    addImport(imports, '@nestjs/common', ['Controller', 'Param']);
    addImport(imports, '@nestjs/swagger', [
      'ApiOperation',
      'ApiResponse',
      'ApiSecurity',
      'ApiTags',
      'ApiParam',
    ]);
    addImport(imports, 'nest-keycloak-connect', 'KeycloakUser');
    addImport(imports, 'src/shared/auth', ['IUserToken']);
    addImport(imports, 'src/shared/infrastructure/controllers', [
      'ApiCommonErrors',
      'staticResponse',
    ]);

    // Service import
    addImport(imports, `../../application/services`, serviceClass);
    // DTOs import
    addImport(imports, '../../application/dtos', [`${className}Response`]);

    if (permissionConfig.enabled) {
      addImport(imports, '../../domain/permissions', [
        `${className}Permissions`,
      ]);
      addImport(imports, '@nestjs/common', [`SetMetadata`]);
      addImport(imports, 'nest-keycloak-connect');
    }
    const plural = pluralize(kebabName);

    // Get by key endpoint (supporting composite keys)
    const keyRoute = keys.map((key) => `:${camelCase(key.name)}`).join('/');
    // Controller lines
    const lines = [];
    lines.push('');
    lines.push(`@Controller({`);
    lines.push(`  version: '1',`);
    lines.push(`})`);
    lines.push(`@ApiTags('${sentenceCase(plural)}')`);
    lines.push(`export class ${controllerClass} {`);
    lines.push(
      `  constructor(private readonly ${camelCase(serviceClass)}: ${serviceClass}) {}`,
    );
    lines.push('');
    if (idxCols.length) {
      addImport(imports, '../../application/dtos', [
        `${className}Response`,
        `${className}ListRequest`,
        `${className}PageResponse`,
      ]);
      // List endpoint
      addImport(imports, '@nestjs/common', 'Get');

      // Batch get endpoint
      if (!schema.parameters?.[table.name]?.cancel?.batch) {
        if (keys.length === 1) {
          addImport(imports, '@nestjs/common', 'Get');
          const key = keys[0];
          lines.push(`  @Get('/batch')`);
          if (permissionConfig.enabled) {
            lines.push(
              `  @SetMetadata('permissions', [${className}Permissions.Read])`,
            );
          }
          lines.push(
            `  @ApiResponse({ type: [${className}Response], ...staticResponse })`,
          );
          lines.push(`  @ApiSecurity('opa_managed')`);
          lines.push(
            `  @ApiOperation({ summary: 'Get multiple ${plural}', description: 'Retrieves multiple ${plural} by their unique ${camelCase(key.name)}s in a single request.' })`,
          );
          addImport(imports, '@nestjs/swagger', 'ApiQuery');
          lines.push(
            `  @ApiQuery({ name: '${camelCase(key.name)}s', required: true, description: 'Comma-separated list of ${kebabName} ${camelCase(key.name)}s', type: String, example: 'A,B,C' })`,
          );
          lines.push(`  @ApiCommonErrors()`);
          lines.push(`  getMultiple(`);
          lines.push(`    @KeycloakUser() user: IUserToken,`);
          addImport(imports, '@nestjs/common', 'Query');
          lines.push(
            `    @Query('${camelCase(pluralize(key.name))}') ${camelCase(pluralize(key.name))}Param: string,`,
          );
          lines.push(`  ): Promise<${className}Response[]> {`);
          lines.push(
            `    const ${camelCase(pluralize(key.name))} = ${camelCase(pluralize(key.name))}Param.split(',').filter((code) => code.trim() !== '');`,
          );
          if (key.type === 'number') {
            lines.push(
              `    return this.${camelCase(serviceClass)}.getMultiple(user, ${camelCase(pluralize(key.name))}.map(Number));`,
            );
          } else {
            lines.push(
              `    return this.${camelCase(serviceClass)}.getMultiple(user, ${camelCase(pluralize(key.name))});`,
            );
          }
          lines.push(`  }`);
          lines.push('');
        }
      }

      lines.push(`  @Get()`);
      if (permissionConfig.enabled) {
        lines.push(
          `  @SetMetadata('permissions', [${className}Permissions.Read])`,
        );
      }
      lines.push(
        `  @ApiResponse({ type: ${className}PageResponse, ...staticResponse })`,
      );
      lines.push(`  @ApiSecurity('opa_managed')`);
      lines.push(
        `  @ApiOperation({ summary: 'List all ${plural}', description: 'Retrieves a paginated list of ${plural} with optional filtering and sorting.' })`,
      );
      lines.push(`  @ApiCommonErrors()`);
      lines.push(`  async list(`);
      lines.push(`    @KeycloakUser() user: IUserToken,`);
      addImport(imports, '@nestjs/common', 'Query');
      lines.push(`    @Query() pageRequest?: ${className}ListRequest,`);
      lines.push(`  ): Promise<${className}PageResponse> {`);
      lines.push(
        `    return await this.${camelCase(serviceClass)}.list(user, pageRequest);`,
      );
      lines.push(`  }`);
      lines.push('');
    }
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      addImport(imports, '@nestjs/common', 'Get');
      lines.push(`  @Get('${keyRoute}')`);
      if (permissionConfig.enabled) {
        lines.push(
          `  @SetMetadata('permissions', [${className}Permissions.Read])`,
        );
      }
      lines.push(
        `  @ApiResponse({ type: ${className}Response, ...staticResponse })`,
      );
      lines.push(`  @ApiSecurity('opa_managed')`);
      lines.push(
        `  @ApiOperation({ summary: 'Get ${kebabName} by key', description: 'Retrieves detailed information about a specific ${kebabName} by its unique key(s).' })`,
      );
      keys.forEach((key) => {
        lines.push(
          `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
        );
      });
      lines.push(`  @ApiCommonErrors()`);
      lines.push(`  async get(`);
      lines.push(`    @KeycloakUser() user: IUserToken,`);
      keys.forEach((key) => {
        lines.push(
          `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
        );
      });
      lines.push(`  ): Promise<${className}Response> {`);
      lines.push(
        `    return this.${camelCase(serviceClass)}.get(user, ${keys.map((key) => camelCase(key.name)).join(', ')});`,
      );
      lines.push(`  }`);
      lines.push('');
    }

    // Create endpoint
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      addImport(imports, '../../application/dtos', [
        `${className}CreateRequest`,
      ]);
      addImport(imports, '@nestjs/common', ['Post', 'Body', 'HttpCode']);
      lines.push(`  @Post()`);
      if (permissionConfig.enabled) {
        lines.push(
          `  @SetMetadata('permissions', [${className}Permissions.Create])`,
        );
      }
      lines.push(`  @HttpCode(201)`);
      lines.push(
        `  @ApiOperation({ summary: 'Create a new ${kebabName}', description: 'Creates a new ${kebabName} with the provided configuration and returns the created resource.' })`,
      );
      lines.push(`  @ApiSecurity('opa_managed')`);
      lines.push(
        `  @ApiResponse({ status: 201, type: ${className}Response, ...staticResponse, headers: { ...staticResponse.headers, Location: { description: 'URI of the newly created resource', schema: { type: 'string', example: '/${plural}/the-key' } } } })`,
      );
      lines.push(`  @ApiCommonErrors()`);
      lines.push(`  async create(`);
      lines.push(`    @KeycloakUser() user: IUserToken,`);
      lines.push(`    @Body() createRequest: ${className}CreateRequest,`);
      lines.push(`  ): Promise<${className}Response> {`);
      lines.push(
        `    return this.${camelCase(serviceClass)}.create(user, createRequest);`,
      );
      lines.push(`  }`);
      lines.push('');
    }

    if (!schema.parameters?.[table.name]?.cancel?.update) {
      // Update endpoint

      addImport(imports, '@nestjs/common', ['Put', 'Body']);
      addImport(imports, '../../application/dtos', [
        `${className}UpdateRequest`,
      ]);
      lines.push(`  @Put('${keyRoute}')`);
      if (permissionConfig.enabled) {
        lines.push(
          `  @SetMetadata('permissions', [${className}Permissions.Update])`,
        );
      }
      lines.push(
        `  @ApiResponse({ type: ${className}Response, ...staticResponse })`,
      );
      lines.push(`  @ApiSecurity('opa_managed')`);
      lines.push(
        `  @ApiOperation({ summary: 'Update a ${kebabName}', description: 'Updates an existing ${kebabName} with the provided changes and returns the updated resource.' })`,
      );

      keys.forEach((key) => {
        lines.push(
          `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
        );
      });
      lines.push(`  @ApiCommonErrors()`);
      lines.push(`  async update(`);
      lines.push(`    @KeycloakUser() user: IUserToken,`);
      keys.forEach((key) => {
        lines.push(
          `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
        );
      });
      lines.push(`    @Body() updateRequest: ${className}UpdateRequest,`);
      lines.push(`  ): Promise<${className}Response> {`);
      lines.push(
        `    return this.${camelCase(serviceClass)}.update(user, ${keys.map((key) => camelCase(key.name)).join(', ')}, updateRequest);`,
      );
      lines.push(`  }`);
      lines.push('');
    }
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      // Delete endpoint
      addImport(imports, '@nestjs/common', ['Delete', 'HttpCode']);
      lines.push(`  @Delete('${keyRoute}')`);
      if (permissionConfig.enabled) {
        lines.push(
          `  @SetMetadata('permissions', [${className}Permissions.Delete])`,
        );
      }
      lines.push(
        `  @ApiOperation({ summary: 'Delete a ${kebabName}', description: 'Permanently removes a ${kebabName} from the system by its unique code.' })`,
      );
      lines.push(`  @ApiSecurity('opa_managed')`);
      lines.push(
        `  @ApiResponse({ status: 204, description: 'The ${kebabName} was successfully deleted.', ...staticResponse })`,
      );
      keys.forEach((key) => {
        lines.push(
          `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
        );
      });
      lines.push(`  @HttpCode(204)`);
      lines.push(`  @ApiCommonErrors()`);
      lines.push(`  async delete(`);
      lines.push(`    @KeycloakUser() user: IUserToken,`);
      keys.forEach((key) => {
        lines.push(
          `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
        );
      });
      lines.push(`  ): Promise<void> {`);
      lines.push(
        `    await this.${camelCase(serviceClass)}.delete(user, ${keys.map((key) => camelCase(key.name)).join(', ')});`,
      );
      lines.push(`  }`);
      lines.push('');
    }

    if (!schema.parameters?.[table.name]?.cancel?.update) {
      // Conditionally add status endpoints if schema has a status or enabled column
      if (
        table.cols.some(
          (col) => col.name === 'status' && col.datatype === 'ENUM',
        )
      ) {
        addImport(imports, '../../application/dtos', [
          `${className}StatusUpdateRequest`,
        ]);
        addImport(imports, '@nestjs/common', ['Patch', 'Body']);
        addImport(imports, '@nestjs/swagger', 'ApiBody');
        lines.push(`  @Patch('${keyRoute}/status')`);
        if (permissionConfig.enabled) {
          lines.push(
            `  @SetMetadata('permissions', [${className}Permissions.UpdateStatus])`,
          );
        }
        lines.push(
          `  @ApiOperation({ summary: 'Update ${kebabName} status', description: 'Updates the status of a ${kebabName}.' })`,
        );
        keys.forEach((key) => {
          lines.push(
            `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
          );
        });
        lines.push(
          `  @ApiBody({ type: ${className}StatusUpdateRequest, description: 'Status update payload' })`,
        );
        lines.push(
          `  @ApiResponse({ type: ${className}Response, ...staticResponse })`,
        );
        lines.push(`  @ApiSecurity('opa_managed')`);
        lines.push(`  @ApiCommonErrors()`);
        lines.push(`  async updateStatus(`);
        lines.push(`    @KeycloakUser() user: IUserToken,`);
        keys.forEach((key) => {
          lines.push(
            `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
          );
        });
        lines.push(`    @Body() body: ${className}StatusUpdateRequest,`);
        lines.push(`  ): Promise<${className}Response> {`);
        lines.push(
          `    return this.${camelCase(serviceClass)}.updateStatus(user, ${keys.map((key) => camelCase(key.name)).join(', ')}, body.status);`,
        );
        lines.push(`  }`);
        lines.push('');
      }
      if (table.cols.some((col) => col.name === 'enabled')) {
        addImport(imports, '@nestjs/common', ['Patch']);
        lines.push(`  @Patch('${keyRoute}/enable')`);
        if (permissionConfig.enabled) {
          lines.push(
            `  @SetMetadata('permissions', [${className}Permissions.UpdateEnabled])`,
          );
        }
        lines.push(
          `  @ApiResponse({ type: ${className}Response, ...staticResponse })`,
        );
        lines.push(`  @ApiSecurity('opa_managed')`);
        lines.push(
          `  @ApiOperation({ summary: 'Enable a ${kebabName}', description: 'Enables a ${kebabName} by its unique code.' })`,
        );
        keys.forEach((key) => {
          lines.push(
            `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
          );
        });
        lines.push(`  @ApiCommonErrors()`);
        lines.push(`  async enable(`);
        lines.push(`    @KeycloakUser() user: IUserToken,`);
        keys.forEach((key) => {
          lines.push(
            `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
          );
        });
        lines.push(`  ): Promise<${className}Response> {`);
        lines.push(
          `    return this.${camelCase(serviceClass)}.enable(user, ${keys.map((key) => camelCase(key.name)).join(', ')});`,
        );
        lines.push(`  }`);
        lines.push('');
        lines.push(`  @Patch('${keyRoute}/disable')`);
        if (permissionConfig.enabled) {
          lines.push(
            `  @SetMetadata('permissions', [${className}Permissions.UpdateEnabled])`,
          );
        }
        lines.push(
          `  @ApiResponse({ type: ${className}Response, ...staticResponse })`,
        );
        lines.push(`  @ApiSecurity('opa_managed')`);
        lines.push(
          `  @ApiOperation({ summary: 'Disable a ${kebabName}', description: 'Disables a ${kebabName} by its unique code.' })`,
        );
        keys.forEach((key) => {
          lines.push(
            `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
          );
        });
        lines.push(`  @ApiCommonErrors()`);
        lines.push(`  async disable(`);
        lines.push(`    @KeycloakUser() user: IUserToken,`);
        keys.forEach((key) => {
          lines.push(
            `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
          );
        });
        lines.push(`  ): Promise<${className}Response> {`);
        lines.push(
          `    return this.${camelCase(serviceClass)}.disable(user, ${keys.map((key) => camelCase(key.name)).join(', ')});`,
        );
        lines.push(`  }`);
        lines.push('');
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
              `Skipping relation ${relation.childCol} for ${table.name} as it does not exist in the table columns.`,
            );
            return;
          }

          if (col.datatype !== 'JSON') {
            const childBase = upperFirst(
              camelCase(singularize(relation.childCol)),
            );

            const childKey = `${camelCase(childBase)}${upperFirst(camelCase(relation.parentCol))}`;
            addImport(imports, '@nestjs/common', ['Post']);
            lines.push(
              `  @Post('${keyRoute}/${kebabCase(childBase)}/:${childKey}')`,
            );
            if (permissionConfig.enabled) {
              lines.push(
                `  @SetMetadata('permissions', [${className}Permissions.${childBase}Add])`,
              );
            }
            lines.push(`  @HttpCode(201)`);
            lines.push(`  @ApiResponse({`);
            lines.push(`    status: 201,`);
            lines.push(`    type: ${className}Response,`);
            lines.push(
              `    description: 'The ${childBase} was successfully added.',`,
            );
            lines.push(`    ...staticResponse,`);
            lines.push(`  })`);
            lines.push(`  @ApiSecurity('opa_managed')`);
            lines.push(`  @ApiOperation({`);
            lines.push(
              `    summary: 'Add a ${childBase} to a ${sentenceCase(className)}',`,
            );
            lines.push(
              `    description: 'Adds a ${childBase} to a ${sentenceCase(className)} by its unique ${relation.parentCol}.',`,
            );
            lines.push(`  })`);
            keys.forEach((key) => {
              lines.push(
                `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
              );
            });
            lines.push(`  @ApiParam({`);
            lines.push(`    name: '${childKey}',`);
            lines.push(
              `    description: 'The ${camelCase(relation.parentCol)} of the ${childBase} to add',`,
            );
            lines.push(`    type: String,`);
            lines.push(`  })`);
            lines.push(`  @ApiCommonErrors()`);
            lines.push(`  async add${childBase}(`);
            lines.push(`    @KeycloakUser() user: IUserToken,`);
            keys.forEach((key) => {
              lines.push(
                `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
              );
            });
            lines.push(`    @Param('${childKey}') ${childKey}: ${col.type},`);
            lines.push(`  ): Promise<${className}Response> {`);
            lines.push(
              `    return this.${camelCase(serviceClass)}.add${childBase}(`,
            );
            lines.push(`      user,`);
            keys.forEach((key) => {
              lines.push(`      ${camelCase(key.name)},`);
            });
            lines.push(`      ${childKey},`);
            lines.push(`    );`);
            lines.push(`  }`);
            lines.push(``);
            lines.push(
              `  // Removes a ${childBase} from a ${sentenceCase(className)}`,
            );
            addImport(imports, '@nestjs/common', ['Delete', 'HttpCode']);
            lines.push(
              `  @Delete('${keyRoute}/${kebabCase(childBase)}/:${childKey}')`,
            );
            if (permissionConfig.enabled) {
              lines.push(
                `  @SetMetadata('permissions', [${className}Permissions.${childBase}Remove])`,
              );
            }
            lines.push(`  @HttpCode(204)`);
            lines.push(`  @ApiResponse({`);
            lines.push(`    type: ${className}Response,`);
            lines.push(`    status: 204,`);
            lines.push(
              `    description: 'The ${childBase} was successfully removed.',`,
            );
            lines.push(`    ...staticResponse,`);
            lines.push(`  })`);
            lines.push(`  @ApiSecurity('opa_managed')`);
            lines.push(`  @ApiOperation({`);
            lines.push(
              `    summary: 'Remove a ${childBase} from a ${sentenceCase(className)}',`,
            );
            lines.push(
              `    description: 'Removes a ${childBase} from a ${sentenceCase(className)}.',`,
            );
            lines.push(`  })`);
            keys.forEach((key) => {
              lines.push(
                `  @ApiParam({ name: '${camelCase(key.name)}', description: 'The unique identifier (${camelCase(key.name)}) of the ${kebabName}', type: ${key.type === 'number' ? 'Number' : 'String'} })`,
              );
            });
            lines.push(`  @ApiParam({`);
            lines.push(`    name: '${childKey}',`);
            lines.push(
              `    description: 'The code of the ${childBase} to remove',`,
            );
            lines.push(`    type: String,`);
            lines.push(`  })`);
            lines.push(`  @ApiCommonErrors()`);
            lines.push(`  async remove${childBase}(`);
            lines.push(`    @KeycloakUser() user: IUserToken,`);
            keys.forEach((key) => {
              lines.push(
                `    @Param('${camelCase(key.name)}') ${camelCase(key.name)}: ${key.type},`,
              );
            });
            lines.push(`    @Param('${childKey}') ${childKey}: ${col.type},`);
            lines.push(`  ): Promise<${className}Response> {`);
            lines.push(
              `    return await this.${camelCase(serviceClass)}.remove${childBase}(`,
            );
            lines.push(`      user,`);
            keys.forEach((key) => {
              lines.push(`      ${camelCase(key.name)},`);
            });
            lines.push(`      ${childKey},`);
            lines.push(`    );`);
            lines.push(`  }`);
            lines.push(``);
          }
        }
      });
    }
    const apis = schema.parameters[table.name]?.apis || {};

    // ...existing code...
    for (const [apiId, api] of Object.entries(apis)) {
      // Determine HTTP method decorator
      const httpMethod = (api.method || 'get').toLowerCase();
      const methodDecorator =
        {
          get: 'Get',
          post: 'Post',
          put: 'Put',
          patch: 'Patch',
          delete: 'Delete',
        }[httpMethod] || 'Get';
      addImport(imports, '@nestjs/common', [methodDecorator]);

      // Route path (apiId, e.g., 'reset/:stream')
      const routePath = apiId;

      // Build method name (e.g., resetStream)
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );

      // Build params
      const paramMatches = [...routePath.matchAll(/:([a-zA-Z0-9_]+)/g)];
      const paramNames = paramMatches.map((m) => m[1]);
      const paramTypes = paramNames.map((p) =>
        api.params?.[p]?.type === 'number' ? 'number' : 'string',
      );

      // Add decorators
      lines.push(`  @${methodDecorator}('${routePath}')`);
      if (permissionConfig.enabled) {
        lines.push(
          `  @SetMetadata('permissions', [${className}Permissions.${upperFirst(methodName)}])`,
        );
      }
      // Add ApiParam decorators
      paramNames.forEach((p) => {
        lines.push(
          `  @ApiParam({ name: '${p}', description: '${api.params?.[p]?.description || ''}', type: ${api.params?.[p]?.type === 'number' ? 'Number' : 'String'} })`,
        );
      });

      if (api.responses && api.responses['200']) {
        lines.push(
          `  @ApiResponse({ description: '${api.responses['200'].description || ''}', type: [${upperFirst(camelCase(className))}Response],...staticResponse })`,
        );
      }
      lines.push(`  @ApiSecurity('opa_managed')`);
      lines.push(
        `  @ApiOperation({ summary: '${api.summary || sentenceCase(methodName)}', description: '${api.description || api.responses?.['200']?.description || ''}' })`,
      );
      lines.push(`  @ApiCommonErrors()`);

      // Build method signature
      const paramsSignature = [
        `@KeycloakUser() user: IUserToken`,
        ...paramNames.map((p, i) => `@Param('${p}') ${p}: ${paramTypes[i]}`),
      ].join(', ');

      lines.push(
        `  async ${methodName}(${paramsSignature}): Promise<${upperFirst(camelCase(className))}Response> {`,
      );
      // Example service call and return
      lines.push(
        `    return await this.${camelCase(serviceClass)}.${methodName}(user${paramNames.length ? ', ' + paramNames.join(', ') : ''});`,
      );
      lines.push(`  }`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');

    // Build import statements
    const importLines = buildImportLines(imports);

    const controllerFile = path.join(
      outDir,
      kebabName,
      'infrastructure',
      'controllers',
      `${kebabName}.controller.ts`,
    );
    if (schema.excluded?.includes(`${kebabName}.controller.ts`)) {
      logger.info(
        `Skipping generation of ${kebabName}.controller.ts as it is excluded.`,
      );
    } else {
      await writeFileWithDir(
        controllerFile,
        importLines + '\n' + lines.join('\n'),
      );
      logger.success(`Created Controller: ${controllerFile}`);
    }
    await createIndexFilesFromDirectory(
      path.resolve(outDir, kebabName, 'infrastructure', 'controllers'),
    );
  }
};

// Export the main entry point
module.exports = { create };
