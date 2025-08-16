#!/usr/bin/env node
/**
 * generate-entities.js
 *
 * A Node.js script to generate NestJS TypeORM entity classes
 * from a cleaned JSON schema, including enums and relations.
 *
 * Usage: node generate-entities.js
 */
const { handleStep } = require('./utils/utils/generator-utils');

const deleteFolders = require('./utils/common/delete-folders');
const setup = require('./utils/common/setup');
const domain = require('./utils/common/generate-domain-interface');
const aggregate = require('./utils/common/generate-domain-aggregate');
const domainProperties = require('./utils/common/generate-domain-properties');
const events = require('./utils/common/generate-domain-events');
const domainList = require('./utils/common/generate-domain-list-interface');
const domainPropertiesCommand = require('./utils/common/generate-domain-properties-command');
const domainValueObjects = require('./utils/common/generate-domain-value-objects');
const domainUltils = require('./utils/common/generate-domain-value-objects-domain');
const domainValueObjectsItems = require('./utils/common/generate-domain-value-objects-items');
const domainExceptions = require('./utils/common/generate-domain-exceptions');
const domainService = require('./utils/common/generate-domain-service');
const domainIndex = require('./utils/common/generate-domain-index');
const domainPropertiesQuery = require('./utils/common/generate-domain-properties-query');
const dtoDecorators = require('./utils/common/generate-dtos-decorators');
const dto = require('./utils/common/generate-dtos-response');
const dtoUpdateCreate = require('./utils/common/generate-dtos-request');
const dtoList = require('./utils/common/generate-dtos-response-list');
const apiController = require('./utils/common/generate-api-controller');
const apiService = require('./utils/common/generate-api-service');
const generateModule = require('./utils/common/generate-module');
const entities = require('./utils/common/generate-entity');

const queries = require('./utils/common/generate-queries');

const commands = require('./utils/common/generate-commands');
const commandsRepository = require('./utils/common/generate-commands-repository');
const finialize = require('./utils/common/finalize');
const domainPropertiesSnapshot = require('./utils/common/generate-domain-properties-snapshot');
const redis = require('./utils/common/generate-redis');
const useCases = require('./utils/common/generate-usecases');
const documents = require('./utils/common/generate-documents');
const permissions = require('./utils/common/generate-permissions');
const projection = require('./utils/common/generate-projection');
const prettier = require('./utils/common/prettier');
const router = require('./utils/common/generate-router');
const domainKeys = require('./utils/common/generate-domain-value-objects-keys');

const monolith = require('./monolith');

async function main() {
  const errors = {};

  // Get schema name from command line arguments
  const schemaName = process.argv[2];

  if (!schemaName) {
    console.error('❌ Error: Schema name is required');
    console.log('📖 Usage: node build.js <schema-name>');
    console.log('📝 Example: node build.js bank-product');
    process.exit(1);
  }

  schema = await setup.create(schemaName);

  await deleteFolders.create(schema);

  await handleStep('redis', async () => await redis.create(schema), errors);

  await handleStep(
    'entities',
    async () => await entities.create(schema),
    errors,
  );

  await finialize.create(schema);
  await handleStep('domain', async () => await domain.create(schema), errors);
  await handleStep(
    'domainKeys',
    async () => await domainKeys.create(schema),
    errors,
  );
  await handleStep(
    'aggregate',
    async () => await aggregate.create(schema),
    errors,
  );
  await handleStep(
    'domainProperties',
    async () => await domainProperties.create(schema),
    errors,
  );
  await handleStep('events', async () => await events.create(schema), errors);
  await handleStep(
    'domainList',
    async () => await domainList.create(schema),
    errors,
  );
  await handleStep(
    'domainValueObjects',
    async () => await domainValueObjects.create(schema),
    errors,
  );
  await handleStep(
    'domainValueObjectsItems',
    async () => await domainValueObjectsItems.create(schema),
    errors,
  );
  await handleStep(
    'domainUltils',
    async () => await domainUltils.create(schema),
    errors,
  );
  await handleStep(
    'domainPropertiesCommand',
    async () => await domainPropertiesCommand.create(schema),
    errors,
  );
  await handleStep(
    'domainService',
    async () => await domainService.create(schema),
    errors,
  );
  await handleStep(
    'domainPropertiesQuery',
    async () => await domainPropertiesQuery.create(schema),
    errors,
  );
  await handleStep(
    'domainPropertiesSnapshot',
    async () => await domainPropertiesSnapshot.create(schema),
    errors,
  );

  await handleStep(
    'dtoUpdateCreate',
    async () => await dtoUpdateCreate.create(schema),
    errors,
  );
  await handleStep(
    'dtoDecorators',
    async () => await dtoDecorators.create(schema),
    errors,
  );
  await handleStep(
    'apiController',
    async () => await apiController.create(schema),
    errors,
  );
  await handleStep(
    'apiService',
    async () => await apiService.create(schema),
    errors,
  );
  await handleStep(
    'generateModule',
    async () => await generateModule.create(schema),
    errors,
  );

  await handleStep('queries', async () => await queries.create(schema), errors);

  await handleStep('dtoList', async () => await dtoList.create(schema), errors);
  await handleStep('dto', async () => await dto.create(schema), errors);

  await handleStep(
    'useCases',
    async () => await useCases.create(schema),
    errors,
  );

  await handleStep(
    'commands',
    async () => await commands.create(schema),
    errors,
  );
  await handleStep(
    'commandsRepository',
    async () => await commandsRepository.create(schema),
    errors,
  );

  await handleStep(
    'projection',
    async () => await projection.create(schema),
    errors,
  );

  await handleStep('router', async () => await router.create(schema), errors);
  await handleStep(
    'documents',
    async () => await documents.create(schema),
    errors,
  );

  await permissions.create(schema);

  await domainExceptions.create(schema, errors);

  await domainIndex.create(schema);

  await prettier.create(schema);

  await monolith.create();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
