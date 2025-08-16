const fs = require('fs-extra');

const path = require('path');
const {
  writeFileWithDir,
  deleteDirectory,
  copyDirectory,
  createIndexFilesFromDirectory,
  deleteFileWithDir,
} = require('./utils/utils/file-utils');
const {
  buildImportLines,
  shouldSkipTable,
} = require('./utils/utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  pluralize,
  sentenceCase,
  snakeCase,
} = require('./utils/utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
} = require('./utils/utils/general-utils');

const prettier = require('./utils/common/prettier');

async function main() {
  Promise.all([await setupMonolith()]);
}

const create = async () => {
  Promise.all([await setupMonolith()]);
};

async function setupMonolith() {
  console.log('Starting monolith generation...');

  const sourceDirectory = path.resolve(__dirname, '../', '../', 'src');

  // let schema = await fs.readJson(
  //   path.resolve(__dirname, '../', '../', moduleName, 'schema.dmm'),
  // );

  const baseDir = path.resolve(__dirname);
  const directories = (await fs.readdir(baseDir, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((dir) => dir !== 'utils' && dir !== 'files');

  let boundedContext = {};

  for (const dir of directories) {
    const paramsPath = path.join(baseDir, dir, 'parameters.json');
    if (await fs.pathExists(paramsPath)) {
      try {
        const params = await fs.readJson(paramsPath);
        boundedContext[dir] = params;
      } catch (err) {
        logger.error(
          `Failed to read parameters.json in ${dir}: ${err.message}`,
        );
      }
    }
  }

  let hasRedis = false,
    hasKafka = false,
    hasEventStream = false,
    hasSql = false;
  Object.values(boundedContext).forEach((params) => {
    if (params.service.hasRedis) hasRedis = true;
    if (params.service.hasKafka) hasKafka = true;
    if (params.service.hasEventStream) hasEventStream = true;
    if (params.service.hasSql) hasSql = true;
  });
  console.log(boundedContext);
  boundedContext = Object.entries(boundedContext).reduce(
    (acc, [key, params]) => {
      const { service, docs } = params;
      if (!service) return acc;

      const { boundedContext } = service;
      console.log(boundedContext);
      if (!boundedContext) return acc;

      if (!acc[boundedContext]) {
        acc[boundedContext] = {
          name: boundedContext,
          services: [],
        };
      }

      acc[boundedContext].services.push({
        name: service.name,
        version: service.version,
        module: service.module,
        summary: docs.summary || '',
        hasRedis: service.hasRedis || false,
        hasKafka: service.hasKafka || false,
        hasEventStream: service.hasEventStream || false,
        hasSql: service.hasSql || false,
      });

      return acc;
    },
    {},
  );

  // Sort boundedContexts by name, and services by module
  boundedContext = Object.keys(boundedContext)
    .sort()
    .reduce((acc, key) => {
      acc[key] = {
        ...boundedContext[key],
        services: boundedContext[key].services.sort((a, b) =>
          a.module.localeCompare(b.module),
        ),
      };
      return acc;
    }, {});

  const globalParameters = {
    boundedContext,
    services: {
      hasRedis,
      hasKafka,
      hasEventStream,
      hasSql,
    },
  };

  Promise.all([
    await swaggerUtils(globalParameters, sourceDirectory),
    await swaggerModel(globalParameters, sourceDirectory),
    await appModule(globalParameters, sourceDirectory),
    await swaggerHub(globalParameters, sourceDirectory),
    await mainTs(globalParameters, sourceDirectory),
    await swaggerUtils(globalParameters, sourceDirectory),
    await copyInfrastructureFiles(globalParameters, sourceDirectory),
    await typeOrmSchemaUtils(globalParameters, sourceDirectory),
  ]);
}

async function swaggerUtils(globalParameters, sourceDirectory) {
  imports = [];
  addImport(imports, '@nestjs/common', ['INestApplication']);
  addImport(imports, 'src/shared/config', ['AppConfigUtil']);
  addImport(imports, './api-hub.doc', ['ApiDocumentationHub']);
  addImport(imports, './architecture.doc', ['ArchitectureDocumentation']);
  addImport(imports, './security.doc', ['SecurityDocumentation']);
  addImport(imports, './swagger.model', ['SwaggerDocumentationUrls']);
  addImport(imports, './standards.doc', ['StandardsDocumentation']);
  addImport(imports, './getting-started.doc', ['GettingStartedDocumentation']);

  addImport(imports, './terminology.doc', ['TerminologyDocumentation']);
  addImport(imports, './overview-postgresql.doc', [
    'OverviewPostgreSQLDocumentation',
  ]);
  addImport(imports, './overview-redis.doc', ['OverviewRedisDocumentation']);
  addImport(imports, './overview-eventstore.doc', [
    'OverviewEventStoreDBDocumentation',
  ]);
  addImport(imports, './overview-kafka.doc', ['OverviewKafkaDocumentation']);

  addImport(imports, './system-operations.doc', [
    'SystemOperationsDocumentation',
  ]);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      addImport(imports, `src/${kebabCase(service.module)}/module.doc`, [
        `${upperFirst(camelCase(service.module))}Documentation`,
      ]);
    });
  });

  const lines = [];
  lines.push(`/**
 * Setup multiple Swagger documentation using modular documentation classes
 */
export function setupMultipleSwaggerDocs(
  app: INestApplication,
  port: string | number,
): SwaggerDocumentationUrls {
  if (AppConfigUtil.isProduction()) {
    return {
      hub: '',
      system: '',
      architecture: '',
      security: '',
      terminology: '',
      standards: '',
      gettingStarted: '',`);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      lines.push(`      ${camelCase(service.module)}: '',`);
    });
  });
  lines.push(`    };
  }

  // Setup consolidated documentation modules (groups multiple domains)
  SystemOperationsDocumentation.setup(app, port);
  ApiDocumentationHub.setup(app, port);
  ArchitectureDocumentation.setup(app, port);
  SecurityDocumentation.setup(app, port);
  StandardsDocumentation.setup(app, port);
  TerminologyDocumentation.setup(app, port);
  GettingStartedDocumentation.setup(app, port);
  OverviewPostgreSQLDocumentation.setup(app, port);
  OverviewRedisDocumentation.setup(app, port);
  OverviewEventStoreDBDocumentation.setup(app, port);
  OverviewKafkaDocumentation.setup(app, port);
`);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      lines.push(
        `  ${upperFirst(camelCase(service.module))}Documentation.setup(app, port);`,
      );
    });
  });

  lines.push(`
  return {
    hub: ApiDocumentationHub.getEndpoint(port),
    system: SystemOperationsDocumentation.getEndpoint(port),
    architecture: ArchitectureDocumentation.getEndpoint(port),
    security: SecurityDocumentation.getEndpoint(port),
    standards: StandardsDocumentation.getEndpoint(port),
    terminology: TerminologyDocumentation.getEndpoint(port),
    gettingStarted: GettingStartedDocumentation.getEndpoint(port),
`);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      lines.push(
        `    ${camelCase(service.module)}: ${upperFirst(camelCase(service.module))}Documentation.getEndpoint(port),`,
      );
    });
  });

  lines.push(`  };`);
  lines.push(`}`);
  lines.push(``);

  const importLines = buildImportLines(imports) + '\n' + lines.join('\n');

  await writeFileWithDir(
    path.resolve(sourceDirectory, 'docs', 'swagger-utils.ts'),
    importLines,
    true,
  );
}

async function swaggerModel(globalParameters, sourceDirectory) {
  const lines = [];
  lines.push(`export { SystemOperationsDocumentation } from './system-operations.doc';
export { ApiDocumentationHub } from './api-hub.doc';
export { ArchitectureDocumentation } from './architecture.doc';
export { SecurityDocumentation } from './security.doc';
export { StandardsDocumentation } from './standards.doc';
export { GettingStartedDocumentation } from './getting-started.doc';
export { TerminologyDocumentation } from './terminology.doc';
export { OverviewPostgreSQLDocumentation } from './overview-postgresql.doc';
export { OverviewRedisDocumentation } from './overview-redis.doc';
export { OverviewEventStoreDBDocumentation } from './overview-eventstore.doc';
export { OverviewKafkaDocumentation } from './overview-kafka.doc';

// Swagger configuration utilities
export { SwaggerConfigUtil } from './swagger-config.util';

// Documentation setup interface
export interface SwaggerDocumentationUrls {
  hub: string;
  system: string;
  architecture: string;
  security: string;
  standards: string;
  terminology: string;
  gettingStarted: string;`);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      lines.push(`  ${camelCase(service.module)}: string;`);
    });
  });

  lines.push(`}`);
  lines.push(``);

  const importLines = lines.join('\n');

  await writeFileWithDir(
    path.resolve(sourceDirectory, 'docs', 'swagger.model.ts'),
    importLines,
    true,
  );
}

async function swaggerHub(globalParameters, sourceDirectory) {
  imports = [];
  addImport(imports, '@nestjs/swagger', ['DocumentBuilder', 'SwaggerModule']);
  addImport(imports, '@nestjs/common', ['INestApplication']);
  addImport(imports, './swagger-config.util', ['SwaggerConfigUtil']);

  const lines = [];
  lines.push(`/**
 * 📚 API Documentation Hub
 *
 * This module creates the main landing page that provides an overview of all
 * available API documentation and serves as a navigation hub.
 */
export class ApiDocumentationHub {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🏗️ Platform API Documentation Hub')
      .setDescription(
        \`
  Welcome to the **API Documentation Hub** for our platform. This hub provides **platform-level guidance**, **infrastructure standards**, and **technical implementation details** that apply across all business domains.
  
  ## 🎯 Architecture Overview
  
  The system is structured into **bounded contexts**, each representing a distinct business domain. Within a bounded context, there may be one or more applications or services, and each application is organized into modules for separation of concerns.
  
  This design enables flexible deployment patterns:
  - **Monolithic**: All contexts in a single application
  - **Modular Monolith**: Contexts as separate modules within one application  
  - **Microservices**: Each context (or application within a context) as independent services
  
  ## 📚 Platform Documentation
  
  | Documentation | Description | Link |
  |---------------|-------------|------|
  | **🎯 Getting Started** | Comprehensive onboarding and setup guide for developers | [📖 View Docs](/api/docs/getting-started) |
  | **📋 Standards & Conventions** | API standards, conventions, and implementation guidelines | [📖 View Docs](/api/docs/standards) |
  | **🧠 Terminology & Strategies** | Platform concepts, multi-tenancy patterns, and implementation strategies | [📖 View Docs](/api/docs/terminology) |
  | **🏗️ Architecture** | Platform architecture philosophy and design patterns | [📖 View Docs](/api/docs/architecture) |
  | **🛡️ Security** | Security architecture and implementation patterns | [📖 View Docs](/api/docs/security) |
  | **🔧 System Operations** | Health monitoring and operational endpoints | [📖 View Docs](/api/docs/system) |
  
  ---
  `);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    lines.push(`## Bounded Context - ${upperFirst(sentenceCase(params.name))}

  | Documentation | Description | Link |
  |---------------|-------------|------|`);
    params.services.forEach((service) => {
      lines.push(
        `  | **${upperFirst(sentenceCase(service.name))}** | ${service.summary} | [📖 View Docs](/api/docs/${kebabCase(service.module)}) |`,
      );
    });
    lines.push(`
  ---
`);
  });

  lines.push(` 
  *💬 **Need Help?** Start with the **[Getting Started Guide](/api/docs/getting-started)** or contact the platform engineering team for infrastructure guidance.*
  
  \`,
      )
      .setVersion('1.0');

    // Add dynamic server configuration
    SwaggerConfigUtil.addServers(config, port);

    // Create document with empty include array to prevent any controllers from being included
    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [], // Explicitly exclude all controllers - this should be documentation only
      deepScanRoutes: false, // Prevent automatic route discovery
      ignoreGlobalPrefix: false,
    });

    // Manually clear any accidentally included paths to ensure only documentation content
    document.paths = {};

    // Clear any business domain schemas and add only infrastructure schemas
    document.components = document.components || {};
    document.components.schemas = {
      // Only include infrastructure/platform schemas - no business domain schemas
    };

    SwaggerModule.setup('api/docs', app, document);
  }

  static getEndpoint(port: string | number): string {
    return \`\${SwaggerConfigUtil.getServerUrl(port)}/api/docs\`;
  }
}
`);

  const importLines = buildImportLines(imports) + '\n' + lines.join('\n');

  await writeFileWithDir(
    path.resolve(sourceDirectory, 'docs', 'api-hub.doc.ts'),
    importLines,
    true,
  );
}

async function appModule(globalParameters, sourceDirectory) {
  imports = [];
  addImport(imports, '@nestjs/common', ['Module']);
  addImport(imports, '@nestjs/config', ['ConfigModule']);
  addImport(imports, '@nestjs/core', ['APP_GUARD']);
  addImport(imports, 'nest-keycloak-connect', [
    'AuthGuard',
    'KeycloakConnectModule',
    'ResourceGuard',
    'RoleGuard,',
  ]);
  addImport(imports, './shared/logger', ['LoggerModule']);
  addImport(imports, './shared/infrastructure', ['KeycloakConfigService']);
  addImport(imports, './health/health.module', ['HealthModule']);

  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      addImport(imports, `./${kebabCase(service.module)}/module`, [
        `${upperFirst(camelCase(service.module))}Module`,
      ]);
    });
  });

  const lines = [];
  lines.push(`@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    KeycloakConnectModule.registerAsync({
      useClass: KeycloakConfigService,
    }),
    LoggerModule,
    HealthModule,
`);
  Object.entries(globalParameters.boundedContext).forEach(([key, params]) => {
    params.services.forEach((service) => {
      lines.push(`    ${upperFirst(camelCase(service.module))}Module,`);
    });
  });

  lines.push(`  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ResourceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}
`);

  const importLines = buildImportLines(imports) + '\n' + lines.join('\n');

  await writeFileWithDir(
    path.resolve(sourceDirectory, 'app.module.ts'),
    importLines,
    true,
  );
  await prettier.file(path.resolve(sourceDirectory, 'app.module.ts'));
}

async function mainTs(globalParameters, sourceDirectory) {
  imports = [];
  addImport(imports, '@nestjs/core', ['NestFactory']);
  addImport(imports, './app.module', ['AppModule']);
  addImport(imports, '@nestjs/common', [
    'LogLevel',
    'RequestMethod',
    'ValidationPipe',
    'VersioningType',
  ]);
  addImport(imports, './shared/config', ['AppConfigUtil']);
  addImport(imports, './shared/logger', ['PinoLogger']);
  addImport(imports, './shared/infrastructure/filters', ['AllExceptionFilter']);
  addImport(imports, './shared/infrastructure/interceptors', [
    'LoggingInterceptor',
  ]);
  if (globalParameters.services.hasSql) {
    addImport(imports, './shared/infrastructure/database', [
      'DatabaseSchemaUtil',
    ]);
  }
  addImport(imports, './docs', ['setupMultipleSwaggerDocs']);

  const lines = [];
  lines.push(`async function bootstrap() {`);
  if (globalParameters.services.hasSql) {
    lines.push(
      `    // Ensure database schema exists before creating the NestJS application`,
    );
    lines.push(`    await DatabaseSchemaUtil.ensureSchemas();`);
    lines.push(``);
  }

  lines.push(`    const logger = new PinoLogger();
    const logLevel = AppConfigUtil.getLogLevel();
    const app = await NestFactory.create(AppModule, {
      logger: logLevel.length > 0 ? (logLevel as LogLevel[]) : [],
    });
  
    app.enableCors();
  
    // app.use(cookieParser());
  
    // Filter
    app.useGlobalFilters(new AllExceptionFilter(logger));
  
    // pipes
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  
    // interceptors
    app.useGlobalInterceptors(new LoggingInterceptor(logger));
  
    // Enable URI versioning
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
  
    // base routing
    const globalPrefix = 'api';
    app.setGlobalPrefix(globalPrefix, {
      exclude: [{ path: 'actuator', method: RequestMethod.GET }],
    });
    const port = AppConfigUtil.getPort('80');
    // swagger config
    if (!AppConfigUtil.isProduction()) {
      // Setup multiple Swagger documents
      setupMultipleSwaggerDocs(app, port);
    }
  
    // Log application startup with our enhanced logger
    logger.log(
      \`Application is running on: \${AppConfigUtil.buildUrl(port, globalPrefix)}\`,
      { component: 'Bootstrap' },
    );
  
    // Also log health metrics to demonstrate one of our enhanced logger features
    logger.logHealthMetrics();
  
    await app.listen(port);
  }
  bootstrap().catch((error) => {
    console.error('Error during application bootstrap:', error);
  });
  `);

  const importLines = buildImportLines(imports) + '\n' + lines.join('\n');

  await writeFileWithDir(
    path.resolve(sourceDirectory, 'main.ts'),
    importLines,
    true,
  );
  await prettier.file(path.resolve(sourceDirectory, 'main.ts'));
}

async function typeOrmSchemaUtils(globalParameters, sourceDirectory) {
  imports = [];
  if (globalParameters.services.hasSql) {
    addImport(imports, 'typeorm', ['DataSource']);

    addImport(imports, '../../config', ['AppConfigUtil']);

    const lines = [];
    lines.push(`/**
 * Database Schema Management Utilities
 *
 * This utility handles database schema creation and management tasks
 * that need to be performed before the main application starts.
 */
export class DatabaseSchemaUtil {
  /**
   * Ensures that required database schemas exist before application startup.
   * Creates schemas if they don't exist to prevent runtime errors.
   *
   * @throws {Error} If schema creation fails or database connection issues occur
   */
  static async ensureSchemas(): Promise<void> {
    // Get database configuration using centralized config utility
    const dbConfig = AppConfigUtil.getDatabaseConfig();

    // Create a temporary DataSource just for schema creation
    const tempDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      username: dbConfig.username,
      password: dbConfig.password,
    });

    try {
      await tempDataSource.initialize();
      const queryRunner = tempDataSource.createQueryRunner();

      // Create required schemas`);

    Object.entries(globalParameters.boundedContext)
      .filter((i) => i.hasSql)
      .forEach(([key, params]) => {
        params.services.forEach((service) => {
          console.log(service);
          lines.push(
            `     await queryRunner.query(\`CREATE SCHEMA IF NOT EXISTS ${snakeCase(service.module)}\`);`,
          );
        });
      });

    lines.push(`     await queryRunner.query(\`CREATE SCHEMA IF NOT EXISTS bank_product\`);
      await queryRunner.query(\`CREATE SCHEMA IF NOT EXISTS core_slack\`);

      await queryRunner.release();
    } catch (error) {
      console.error('Error ensuring schema:', error);
      throw error;
    } finally {
      if (tempDataSource.isInitialized) {
        await tempDataSource.destroy();
      }
    }
  }
}
`);
    if (globalParameters.services.hasSql) {
    }

    const importLines = buildImportLines(imports) + '\n' + lines.join('\n');

    await writeFileWithDir(
      path.resolve(
        sourceDirectory,
        'shared',
        'infrastructure',
        'database',
        'schema.util.ts',
      ),
      importLines,
      true,
    );
    await prettier.file(
      path.resolve(
        sourceDirectory,
        'shared',
        'infrastructure',
        'database',
        'schema.util.ts',
      ),
    );
  } else {
    await deleteDirectory(
      path.resolve(
        sourceDirectory,
        'shared',
        'infrastructure',
        'database',
        'schema.util.ts',
      ),
    );
  }

  await createIndexFilesFromDirectory(
    path.resolve(sourceDirectory, 'shared', 'infrastructure', 'database'),
  );
}

async function copyInfrastructureFiles(globalParameters, sourceDirectory) {
  if (globalParameters.services.hasEventStream) {
    const outDir = path.resolve(
      sourceDirectory,
      'shared',
      'infrastructure',
      'event-store',
    );

    await copyDirectory(
      path.join(__dirname, 'utils', 'infrastructure', 'event-store'),
      outDir,
      [],
    );
  } else {
    await deleteDirectory(
      path.resolve(sourceDirectory, 'shared', 'infrastructure', 'event-store'),
    );
  }

  if (globalParameters.services.hasRedis) {
    const outDir = path.resolve(
      sourceDirectory,
      'shared',
      'infrastructure',
      'redis',
    );

    await copyDirectory(
      path.join(__dirname, 'utils', 'infrastructure', 'redis'),
      outDir,
      [],
    );
  } else {
    await deleteDirectory(
      path.resolve(sourceDirectory, 'shared', 'infrastructure', 'redis'),
    );
  }

  if (globalParameters.services.hasSql) {
    const outDir = path.resolve(
      sourceDirectory,
      'shared',
      'infrastructure',
      'database',
    );

    await copyDirectory(
      path.join(__dirname, 'utils', 'infrastructure', 'database'),
      outDir,
      [],
    );
  } else {
    await deleteDirectory(
      path.resolve(sourceDirectory, 'shared', 'infrastructure', 'database'),
    );
  }
  await deleteFileWithDir(
    path.resolve(sourceDirectory, 'shared', 'infrastructure', 'index.ts'),
  );
  await createIndexFilesFromDirectory(
    path.resolve(sourceDirectory, 'shared', 'infrastructure'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

exports.create = create;
