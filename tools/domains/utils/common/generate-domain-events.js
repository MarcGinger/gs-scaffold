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
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

async function writeEventFile(filePath, lines) {
  if (schema.excluded?.includes(filePath)) {
    logger.info(`Skipping generation of ${filePath} as it is excluded.`);
    return;
  }

  await writeFileWithDir(filePath, lines);
}

const create = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.info(
        `Skipping domain interface for table: ${table.name} (JSON PK)`,
      );
      continue;
    }

    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      logger.info(
        `Skipping domain interface for table: ${table.name} (cancelled in schema)`,
      );
      continue;
    }

    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));

    const domainEvent = [
      `import { IUserToken } from 'src/shared/auth';`,
      `import { DomainEvent } from 'src/shared/domain/events';`,
      `import { I${className} } from '../entities';`,
      ``,
      `export abstract class ${className}DomainEvent extends DomainEvent {`,
      `  abstract readonly eventType: string;`,
      ``,
      `  constructor(`,
      `    public readonly user: IUserToken,`,
      `    public readonly aggregateId: string,`,
      `    public readonly props: I${className},`,
      `  ) {`,
      `    super(user, aggregateId);`,
      `  }`,
      `}`,
    ];

    writeEventFile(
      path.join(
        outDir,
        fileBase,
        'domain',
        'events',
        `${fileBase}-domain.event.ts`,
      ),
      domainEvent.join('\n'),
    );

    if (!schema.parameters?.[table.name]?.cancel?.create) {
      const createEvent = [
        `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
        ``,
        `export class ${className}CreatedEvent extends ${className}DomainEvent {`,
        `  readonly eventType = '${camelCase(className)}.created.v1';`,
        `}`,
      ];
      writeEventFile(
        path.join(outDir, fileBase, 'domain', 'events', `create.event.ts`),
        createEvent.join('\n'),
      );
    }

    if (!schema.parameters?.[table.name]?.cancel?.update) {
      const updateEvent = [
        `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
        ``,
        `export class ${className}UpdatedEvent extends ${className}DomainEvent {`,
        `  readonly eventType = '${camelCase(className)}.updated.v1';`,
        `}`,
      ];
      writeEventFile(
        path.join(outDir, fileBase, 'domain', 'events', `update.event.ts`),
        updateEvent.join('\n'),
      );
    }

    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      const deleteEvent = [
        `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
        ``,
        `export class ${className}DeletedEvent extends ${className}DomainEvent {`,
        `  readonly eventType = '${camelCase(className)}.deleted.v1';`,
        `}`,
      ];
      writeEventFile(
        path.join(outDir, fileBase, 'domain', 'events', `delete.event.ts`),
        deleteEvent.join('\n'),
      );
    }

    if (!schema.parameters?.[table.name]?.cancel?.update) {
      if (
        table.cols.find(
          (col) => col.name === 'status' && col.datatype === 'ENUM',
        )
      ) {
        const updateStatusEvent = [
          `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
          ``,
          `export class Update${className}StatusEvent extends ${className}DomainEvent {`,
          `  readonly eventType = '${camelCase(className)}.statusupdated.v1';`,
          `}`,
        ];
        writeEventFile(
          path.join(
            outDir,
            fileBase,
            'domain',
            'events',
            `update-status.event.ts`,
          ),
          updateStatusEvent.join('\n'),
        );
      }

      if (
        table.cols.find(
          (col) => col.name === 'enabled' && col.datatype === 'BOOLEAN',
        )
      ) {
        const enabledEvent = [
          `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
          ``,
          `export class ${className}EnabledEvent extends ${className}DomainEvent {`,
          `  readonly eventType = '${camelCase(className)}.enabled.v1';`,
          `}`,
        ];
        writeEventFile(
          path.join(outDir, fileBase, 'domain', 'events', `enabled.event.ts`),
          enabledEvent.join('\n'),
        );
        const disabledEvent = [
          `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
          ``,
          `export class ${className}DisabledEvent extends ${className}DomainEvent {`,
          `  readonly eventType = '${camelCase(className)}.disabled.v1';`,
          `}`,
        ];
        writeEventFile(
          path.join(outDir, fileBase, 'domain', 'events', `disabled.event.ts`),
          disabledEvent.join('\n'),
        );
      }
    }

    table._relationships.forEach((relation) => {
      const col = table.cols.find((c) => c.name === relation.childCol);
      if (
        relation.c_ch === 'many' &&
        relation.c_p === 'many' &&
        relation.parent !== table.name &&
        col.defaultvalue !== 'object()'
      ) {
        const relClass = `${upperFirst(camelCase(singularize(relation.childCol)))}`;

        const addedEvent = [
          `import { IUserToken } from 'src/shared/auth';`,
          `import { I${className} } from '../entities';`,
          `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
          ``,
          `export class ${className}${relClass}AddedEvent extends ${className}DomainEvent {`,
          `  readonly eventType = '${camelCase(className)}.${camelCase(relClass).toLowerCase()}.added.v1';`,
          ``,
          `  constructor(`,
          `    user: IUserToken,`,
          `    public readonly aggregateId: string,`,
          `    props: I${className},`,
          `  ) {`,
          `    super(user, aggregateId, props);`,
          `  }`,
          `}`,
          ``,
        ];
        writeEventFile(
          path.join(
            outDir,
            fileBase,
            'domain',
            'events',
            `${kebabCase(className)}-${kebabCase(relClass)}-added.event.ts`,
          ),
          addedEvent.join('\n'),
        );

        const removedEvent = [
          `import { IUserToken } from 'src/shared/auth';`,
          `import { I${className} } from '../entities';`,
          `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
          ``,
          `export class ${className}${relClass}RemovedEvent extends ${className}DomainEvent {`,
          `  readonly eventType = '${camelCase(className)}.${camelCase(relClass).toLowerCase()}.removed.v1';`,
          ``,
          `  constructor(`,
          `    user: IUserToken,`,
          `    public readonly aggregateId: string,`,
          `    props: I${className},`,
          `  ) {`,
          `    super(user, aggregateId, props);`,
          `  }`,
          `}`,
          ``,
        ];
        writeEventFile(
          path.join(
            outDir,
            fileBase,
            'domain',
            'events',
            `${kebabCase(className)}-${kebabCase(relClass)}-removed.event.ts`,
          ),
          removedEvent.join('\n'),
        );
      }
    });

    // Add custom API events
    const apis = schema.parameters?.[table.name]?.apis || {};
    for (const [apiId, api] of Object.entries(apis)) {
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );
      const eventClass = `${className}${upperFirst(methodName)}Event`;
      // Find params from the route (e.g., :stream)
      const paramMatches = [...apiId.matchAll(/:([a-zA-Z0-9_]+)/g)];
      const paramNames = paramMatches.map((m) => m[1]);
      const paramTypes = paramNames.map((p) =>
        api.params?.[p]?.type === 'number' ? 'number' : 'string',
      );

      const key = apiId.split('/')[0];
      const apiEvent = [
        `import { IUserToken } from 'src/shared/auth';`,
        `import { I${className} } from '../entities';`,
        `import { ${className}DomainEvent } from './${fileBase}-domain.event';`,
        ``,
        `export class ${eventClass} extends ${className}DomainEvent {`,
        `  readonly eventType = '${camelCase(className)}.${camelCase(key).toLowerCase()}.completed.v1';`,
        ``,
        `  constructor(`,
        `    user: IUserToken,`,
        `    public readonly aggregateId: string,`,
        `    props: I${className},`,
        `  ) {`,
        `    super(user, aggregateId, props);`,
        `  }`,
        `}`,
        ``,
      ];
      writeEventFile(
        path.join(
          outDir,
          fileBase,
          'domain',
          'events',
          `${kebabCase(className)}-${kebabCase(key)}-completed.event.ts`,
        ),
        apiEvent.join('\n'),
      );
    }
  }
};

exports.create = create;
