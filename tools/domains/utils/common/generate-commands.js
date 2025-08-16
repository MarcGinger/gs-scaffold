const path = require('path');
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
  readFileWithDir,
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
  pluralize,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

const addIndexTs = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }

    if (
      schema.parameters?.[table.name]?.cancel?.delete &&
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update
    ) {
      continue;
    }

    const fileBase = kebabCase(table.name);
    const indexPath = path.join(outDir, fileBase, 'application');
    await createIndexFilesFromDirectory(indexPath);
  }
};

// --- SECTION GENERATORS ---
const generateCreateCommandAndHandler = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      const fileBase = kebabCase(table.name);
      const className = upperFirst(camelCase(table.name));
      const interfaceName = `I${className}`;
      const createInterfaceName = `Create${className}Props`;
      const exceptionMsgName = `${className}ExceptionMessage`;

      // Command
      const createCommandImports = [
        `import { IUserToken } from 'src/shared/auth';`,
        `import { ${createInterfaceName} } from '../../../domain';`,
        '',
      ];
      const createCommandClass = [
        `// generate-commands`,
        `export class Create${className}Command {`,
        `  constructor(`,
        `    public user: IUserToken,`,
        `    public readonly props: ${createInterfaceName},`,
        `  ) {}`,
        `}`,
        '',
      ];
      const createCommandFileContent =
        createCommandImports.join('\n') + createCommandClass.join('\n');
      const createCommandFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `create`,
        `create-${fileBase}.command.ts`,
      );
      await writeFileWithDir(createCommandFilePath, createCommandFileContent);

      // Handler
      const createHandlerImports = [
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
        `import { handleCommandError } from 'src/shared/application/commands';`,
        `import { ${interfaceName} } from '../../../domain/entities';`,
        `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
        `import { Create${className}UseCase } from '../../usecases';`,
        `import { Create${className}Command } from './create-${fileBase}.command';`,
        '',
      ];
      const createHandlerClass = [
        `@CommandHandler(Create${className}Command)`,

        `export class Create${className}Handler implements ICommandHandler<Create${className}Command, ${interfaceName}> {`,
        `  constructor(private readonly ${camelCase(fileBase)}CreateUseCase: Create${className}UseCase) {}`,
        '',
        `  async execute(command: Create${className}Command): Promise<${interfaceName}> {`,
        `    const { user, props } = command;`,
        `    try {`,
        `      return await this.${camelCase(fileBase)}CreateUseCase.execute(user, props);`,
        `    } catch (error) {`,
        `      handleCommandError(error, null, ${exceptionMsgName}.createError);`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const createHandlerFileContent =
        createHandlerImports.join('\n') + createHandlerClass.join('\n');
      const createHandlerFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `create`,
        `create-${fileBase}.handler.ts`,
      );
      await writeFileWithDir(createHandlerFilePath, createHandlerFileContent);
    }
  }
};

const generateUpdateCommandAndHandler = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    const key = keys[0];
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      const fileBase = kebabCase(table.name);
      const className = upperFirst(camelCase(table.name));
      const interfaceName = `I${className}`;
      const updateInterfaceName = `Update${className}Props`;
      const exceptionMsgName = `${className}ExceptionMessage`;

      // Command
      const updateCommandImports = [
        `import { IUserToken } from 'src/shared/auth';`,
        `import { ${updateInterfaceName} } from '../../../domain/properties';`,
        '',
      ];
      const updateCommandClass = [
        `export class Update${className}Command {`,
        `  constructor(`,
        `    public user: IUserToken,`,
        `    public readonly ${camelCase(key.name)}: ${key.type},`,
        `    public readonly props: ${updateInterfaceName},`,
        `  ) {}`,
        `}`,
        '',
      ];
      const updateCommandFileContent =
        updateCommandImports.join('\n') + updateCommandClass.join('\n');
      const updateCommandFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `update`,
        `update-${fileBase}.command.ts`,
      );
      await writeFileWithDir(updateCommandFilePath, updateCommandFileContent);

      // Handler
      const updateHandlerImports = [
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
        `import { handleCommandError } from 'src/shared/application/commands';`,
        `import { ${interfaceName} } from '../../../domain/entities';`,
        `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
        `import { Update${className}UseCase } from '../../usecases';`,
        `import { Update${className}Command } from './update-${fileBase}.command';`,
        '',
      ];
      const updateHandlerClass = [
        `@CommandHandler(Update${className}Command)`,

        `export class Update${className}Handler implements ICommandHandler<Update${className}Command, ${interfaceName}> {`,
        `  constructor(private readonly ${camelCase(fileBase)}UpdateUseCase: Update${className}UseCase) {}`,
        '',
        `  async execute(command: Update${className}Command): Promise<${interfaceName}> {`,
        `    const { user, ${camelCase(key.name)}, props } = command;`,
        `    try {`,
        `      return await this.${camelCase(fileBase)}UpdateUseCase.execute(user, ${camelCase(key.name)}, props);`,
        `    } catch (error) {`,
        `      handleCommandError(error, null, ${exceptionMsgName}.updateError);`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const updateHandlerFileContent =
        updateHandlerImports.join('\n') + updateHandlerClass.join('\n');
      const updateHandlerFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `update`,
        `update-${fileBase}.handler.ts`,
      );
      await writeFileWithDir(updateHandlerFilePath, updateHandlerFileContent);
    }
  }
};

const generateDeleteCommandAndHandler = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    const key = keys[0];
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      const fileBase = kebabCase(table.name);
      const className = upperFirst(camelCase(table.name));
      const interfaceName = `I${className}`;
      const exceptionMsgName = `${className}ExceptionMessage`;

      // Command
      const deleteCommandImports = [
        `import { IUserToken } from 'src/shared/auth';`,
        '',
      ];
      const deleteCommandClass = [
        `export class Delete${className}Command {`,
        `  constructor(`,
        `    public user: IUserToken,`,
        `    public readonly ${camelCase(key.name)}: ${key.type},`,
        `  ) {}`,
        `}`,
        '',
      ];
      const deleteCommandFileContent =
        deleteCommandImports.join('\n') + deleteCommandClass.join('\n');
      const deleteCommandFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `delete`,
        `delete-${fileBase}.command.ts`,
      );
      await writeFileWithDir(deleteCommandFilePath, deleteCommandFileContent);

      // Handler
      const deleteHandlerImports = [
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
        `import { handleCommandError } from 'src/shared/application/commands';`,
        `import { ${interfaceName} } from '../../../domain/entities';`,
        `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
        `import { Delete${className}UseCase } from '../../usecases';`,
        `import { Delete${className}Command } from './delete-${fileBase}.command';`,
        '',
      ];
      const deleteHandlerClass = [
        `@CommandHandler(Delete${className}Command)`,

        `export class Delete${className}Handler implements ICommandHandler<Delete${className}Command, ${interfaceName}> {`,
        `  constructor(private readonly ${camelCase(fileBase)}DeleteUseCase: Delete${className}UseCase) {}`,
        '',
        `  async execute(command: Delete${className}Command): Promise<${interfaceName}> {`,
        `    const { user, ${camelCase(key.name)} } = command;`,
        `    try {`,
        `      return await this.${camelCase(fileBase)}DeleteUseCase.execute(user, ${camelCase(key.name)});`,
        `    } catch (error) {`,
        `      handleCommandError(error, null, ${exceptionMsgName}.deleteError);`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const deleteHandlerFileContent =
        deleteHandlerImports.join('\n') + deleteHandlerClass.join('\n');
      const deleteHandlerFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `delete`,
        `delete-${fileBase}.handler.ts`,
      );
      await writeFileWithDir(deleteHandlerFilePath, deleteHandlerFileContent);
    }
  }
};

const generateEnableDisableCommandsAndHandlers = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    if (schema.parameters?.[table.name]?.cancel?.update) {
      continue;
    }
    const key = keys[0];
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const interfaceName = `I${className}`;
    const exceptionMsgName = `${className}ExceptionMessage`;
    // --- ENABLE/DISABLE COMMANDS & HANDLERS ---
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'enabled')
    ) {
      // Enable Command
      const enableCommandClass = [
        `import { IUserToken } from 'src/shared/auth';`,
        ``,
        `export class Enable${className}Command {`,
        `  constructor(`,
        `    public user: IUserToken,`,
        `    public readonly ${camelCase(key.name)}: ${key.type},`,
        `  ) {}`,
        `}`,
        '',
      ];
      const enableCommandFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `enable`,
        `enable-${fileBase}.command.ts`,
      );
      await writeFileWithDir(
        enableCommandFilePath,
        enableCommandClass.join('\n'),
      );

      // Enable Handler
      const enableHandlerImports = [
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
        `import { handleCommandError } from 'src/shared/application/commands';`,
        `import { ${interfaceName} } from '../../../domain/entities';`,
        `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
        `import { Enable${className}UseCase } from '../../usecases';`,
        `import { Enable${className}Command } from './enable-${fileBase}.command';`,
        '',
      ];
      const enableHandlerClass = [
        `@CommandHandler(Enable${className}Command)`,

        `export class Enable${className}Handler implements ICommandHandler<Enable${className}Command, ${interfaceName}> {`,
        `  constructor(private readonly ${camelCase(fileBase)}EnableUseCase: Enable${className}UseCase) {}`,
        '',
        `  async execute(command: Enable${className}Command): Promise<${interfaceName}> {`,
        `    const { user, ${camelCase(key.name)} } = command;`,
        `    try {`,
        `      return await this.${camelCase(fileBase)}EnableUseCase.execute(user, ${camelCase(key.name)});`,
        `    } catch (error) {`,
        `      handleCommandError(error, null, ${exceptionMsgName}.updateError);`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const enableHandlerFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `enable`,
        `enable-${fileBase}.handler.ts`,
      );
      await writeFileWithDir(
        enableHandlerFilePath,
        enableHandlerImports.join('\n') + enableHandlerClass.join('\n'),
      );

      // Disable Command
      const disableCommandClass = [
        `import { IUserToken } from 'src/shared/auth';`,
        ``,
        `export class Disable${className}Command {`,
        `  constructor(`,
        `    public user: IUserToken,`,
        `    public readonly ${camelCase(key.name)}: ${key.type},`,
        `  ) {}`,
        `}`,
        '',
      ];
      const disableCommandFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `disable`,
        `disable-${fileBase}.command.ts`,
      );
      await writeFileWithDir(
        disableCommandFilePath,
        disableCommandClass.join('\n'),
      );

      // Disable Handler
      const disableHandlerImports = [
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
        `import { handleCommandError } from 'src/shared/application/commands';`,
        `import { ${interfaceName} } from '../../../domain/entities';`,
        `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
        `import { Disable${className}UseCase } from '../../usecases';`,
        `import { Disable${className}Command } from './disable-${fileBase}.command';`,
        '',
      ];
      const disableHandlerClass = [
        `@CommandHandler(Disable${className}Command)`,

        `export class Disable${className}Handler implements ICommandHandler<Disable${className}Command, ${interfaceName}> {`,
        `  constructor(private readonly ${camelCase(fileBase)}DisableUseCase: Disable${className}UseCase) {}`,
        '',
        `  async execute(command: Disable${className}Command): Promise<${interfaceName}> {`,
        `    const { user, ${camelCase(key.name)} } = command;`,
        `    try {`,
        `      return await this.${camelCase(fileBase)}DisableUseCase.execute(user, ${camelCase(key.name)});`,
        `    } catch (error) {`,
        `      handleCommandError(error, null, ${exceptionMsgName}.updateError);`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const disableHandlerFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `disable`,
        `disable-${fileBase}.handler.ts`,
      );
      await writeFileWithDir(
        disableHandlerFilePath,
        disableHandlerImports.join('\n') + disableHandlerClass.join('\n'),
      );
    }
  }
};

const generateStatusCommandAndHandler = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    if (schema.parameters?.[table.name]?.cancel?.update) {
      continue;
    }
    const key = keys[0];
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const interfaceName = `I${className}`;
    const exceptionMsgName = `${className}ExceptionMessage`;
    // --- STATUS COMMAND & HANDLER ---
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'status' && col.datatype === 'ENUM')
    ) {
      // Status Handler
      const statusHandlerImports = [
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
        `import { handleCommandError } from 'src/shared/application/commands';`,
        `import { ${interfaceName} } from '../../../domain/entities';`,
        `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
        `import { Update${className}StatusUseCase } from '../../usecases';`,
        `import { Update${className}StatusCommand } from './update-${fileBase}-status.command';`,
        '',
      ];
      const statusHandlerClass = [
        `@CommandHandler(Update${className}StatusCommand)`,

        `export class Update${className}StatusHandler implements ICommandHandler<Update${className}StatusCommand, ${interfaceName}> {`,
        `  constructor(private readonly ${camelCase(fileBase)}UpdateStatusUseCase: Update${className}StatusUseCase) {}`,
        '',
        `  async execute(command: Update${className}StatusCommand): Promise<${interfaceName}> {`,
        `    const { user, ${camelCase(key.name)}, status } = command;`,
        `    try {`,
        `      return await this.${camelCase(fileBase)}UpdateStatusUseCase.execute(user, ${camelCase(key.name)}, status);`,
        `    } catch (error) {`,
        `      handleCommandError(error, null, ${exceptionMsgName}.updateError);`,
        `      throw error;`,
        `    }`,
        `  }`,
        `}`,
        '',
      ];
      const statusHandlerFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `update-status`,
        `update-${fileBase}-status.handler.ts`,
      );
      await writeFileWithDir(
        statusHandlerFilePath,
        statusHandlerImports.join('\n') + statusHandlerClass.join('\n'),
      );

      //UPDATE COMMAND
      const UpdateStatusCommandClass = [
        `import { IUserToken } from 'src/shared/auth';`,
        `import { ${className}StatusEnum } from '../../../domain/entities';`,
        ``,
        `export class Update${className}StatusCommand {`,
        `  constructor(`,
        `    public user: IUserToken,`,
        `    public readonly ${camelCase(key.name)}: ${key.type},`,
        `    public readonly status: ${className}StatusEnum,`,
        `  ) {}`,
        `}`,
        '',
      ];
      const StatusCommandFilePath = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `update-status`,
        `update-${fileBase}-status.command.ts`,
      );
      await writeFileWithDir(
        StatusCommandFilePath,
        UpdateStatusCommandClass.join('\n'),
      );
    }
  }
};

const generateRelationshipCommandsAndHandlers = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      continue;
    }
    if (schema.parameters?.[table.name]?.cancel?.update) {
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    const interfaceName = `I${className}`;
    const exceptionMsgName = `${className}ExceptionMessage`;
    // --- RELATIONSHIP COMMANDS & HANDLERS ---
    if (Array.isArray(table._relationships)) {
      for (const rel of table._relationships) {
        const relName = upperFirst(camelCase(singularize(rel.childCol)));
        const relFileName = kebabCase(relName);
        // Find the column for this relationship
        const col = table.cols.find((c) => c.name === rel.childCol);
        if (!col || col.datatype === 'JSON') continue;

        const childBase = upperFirst(camelCase(singularize(rel.childCol)));
        const childKey = `${camelCase(childBase)}${upperFirst(camelCase(rel.parentCol))}`;

        // Arrays: add/remove, Objects: update
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          // Add Command & Handler
          const addCommandClass = [
            `import { IUserToken } from 'src/shared/auth';`,
            ``,
            `export class Add${relName}To${className}Command {`,
            `  constructor(`,
            `    public user: IUserToken,`,
            `${keys.map((key) => `    public readonly ${camelCase(key.name)}: ${key.type},`).join('\n')}`,
            `    public readonly ${childKey}: ${col.type},`,
            `  ) {}`,
            `}`,
            '',
          ];
          const addCommandFilePath = path.join(
            outDir,
            fileBase,
            'application',
            'commands',
            `add-${relFileName}`,
            `add-${relFileName}-to-${fileBase}.command.ts`,
          );
          await writeFileWithDir(
            addCommandFilePath,
            addCommandClass.join('\n'),
          );

          const addHandlerImports = [
            `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
            `import { handleCommandError } from 'src/shared/application/commands';`,
            `import { ${interfaceName} } from '../../../domain/entities';`,
            `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
            `import { Add${relName}To${className}UseCase } from '../../usecases';`,
            `import { Add${relName}To${className}Command } from './add-${relFileName}-to-${fileBase}.command';`,
            '',
          ];
          const addHandlerClass = [
            `@CommandHandler(Add${relName}To${className}Command)`,

            `export class Add${relName}To${className}Handler implements ICommandHandler<Add${relName}To${className}Command, ${interfaceName}> {`,
            `  constructor(private readonly ${camelCase(fileBase)}Add${relName}UseCase: Add${relName}To${className}UseCase) {}`,
            '',
            `  async execute(command: Add${relName}To${className}Command): Promise<${interfaceName}> {`,
            `    const { user, ${keys.map((key) => camelCase(key.name)).join(', ')}, ${childKey} } = command;`,
            `    try {`,
            `      return await this.${camelCase(fileBase)}Add${relName}UseCase.execute(user, ${keys.map((key) => camelCase(key.name)).join(', ')}, ${childKey});`,
            `    } catch (error) {`,
            `      handleCommandError(error, null, ${exceptionMsgName}.notFound);`,
            `      throw error;`,
            `    }`,
            `  }`,
            `}`,
            '',
          ];
          const addHandlerFilePath = path.join(
            outDir,
            fileBase,
            'application',
            'commands',
            `add-${relFileName}`,
            `add-${relFileName}-to-${fileBase}.handler.ts`,
          );
          await writeFileWithDir(
            addHandlerFilePath,
            addHandlerImports.join('\n') + addHandlerClass.join('\n'),
          );

          // Remove Command & Handler
          const removeCommandClass = [
            `import { IUserToken } from 'src/shared/auth';`,
            ``,
            `export class Remove${relName}From${className}Command {`,
            `  constructor(`,
            `    public user: IUserToken,`,
            `${keys.map((key) => `    public readonly ${camelCase(key.name)}: ${key.type},`).join('\n')}`,

            `    public readonly ${childKey}: ${col.type},`,
            `  ) {}`,
            `}`,
            '',
          ];
          const removeCommandFilePath = path.join(
            outDir,
            fileBase,
            'application',
            'commands',
            `remove-${relFileName}`,
            `remove-${relFileName}-from-${fileBase}.command.ts`,
          );
          await writeFileWithDir(
            removeCommandFilePath,
            removeCommandClass.join('\n'),
          );

          const removeHandlerImports = [
            `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
            `import { handleCommandError } from 'src/shared/application/commands';`,
            `import { ${interfaceName} } from '../../../domain/entities';`,
            `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
            `import { Remove${relName}From${className}UseCase } from '../../usecases';`,
            `import { Remove${relName}From${className}Command } from './remove-${relFileName}-from-${fileBase}.command';`,
            '',
          ];
          const removeHandlerClass = [
            `@CommandHandler(Remove${relName}From${className}Command)`,

            `export class Remove${relName}From${className}Handler implements ICommandHandler<Remove${relName}From${className}Command, ${interfaceName}> {`,
            `  constructor(private readonly ${camelCase(fileBase)}Remove${relName}UseCase: Remove${relName}From${className}UseCase) {}`,
            '',
            `  async execute(command: Remove${relName}From${className}Command): Promise<${interfaceName}> {`,
            `    const { user, ${keys.map((key) => `${key.name},`).join(' ')} ${childKey} } = command;`,
            `    try {`,
            `      return await this.${camelCase(fileBase)}Remove${relName}UseCase.execute(user, ${keys.map((key) => `${key.name},`).join(' ')} ${childKey});`,
            `    } catch (error) {`,
            `      handleCommandError(error, null, ${exceptionMsgName}.notFound);`,
            `      throw error;`,
            `    }`,
            `  }`,
            `}`,
            '',
          ];
          const removeHandlerFilePath = path.join(
            outDir,
            fileBase,
            'application',
            'commands',
            `remove-${relFileName}`,
            `remove-${relFileName}-from-${fileBase}.handler.ts`,
          );
          await writeFileWithDir(
            removeHandlerFilePath,
            removeHandlerImports.join('\n') + removeHandlerClass.join('\n'),
          );
        } else if (rel.c_p === 'one' && rel.c_ch === 'many') {
          // Update Command & Handler for object relationship
          const updateCommandClass = [
            `import { IUserToken } from 'src/shared/auth';`,
            ``,
            `export class Update${className}${relName}Command {`,
            `  constructor(`,
            `    public user: IUserToken,`,
            `    public readonly id: string,`,
            `    public readonly relId: string,`,
            `  ) {}`,
            `}`,
            '',
          ];
          const updateCommandFilePath = path.join(
            outDir,
            fileBase,
            'application',
            'commands',
            `update-${relFileName}`,
            `update-${fileBase}-${relFileName}.command.ts`,
          );
          await writeFileWithDir(
            updateCommandFilePath,
            updateCommandClass.join('\n'),
          );

          const updateHandlerImports = [
            `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
            `import { handleCommandError } from 'src/shared/application/commands';`,
            `import { ${interfaceName} } from '../../../domain/entities';`,
            `import { ${exceptionMsgName} } from '../../../domain/exceptions';`,
            `import { Update${className}${relName}UseCase } from '../../usecases';`,
            `import { Update${className}${relName}Command } from './update-${fileBase}-${relFileName}.command';`,
            '',
          ];
          const updateHandlerClass = [
            `@CommandHandler(Update${className}${relName}Command)`,

            `export class Update${className}${relName}Handler implements ICommandHandler<Update${className}${relName}Command, ${interfaceName}> {`,
            `  constructor(private readonly ${camelCase(fileBase)}Update${relName}UseCase: Update${className}${relName}UseCase) {}`,
            '',
            `  async execute(command: Update${className}${relName}Command): Promise<${interfaceName}> {`,
            `    const { id, relId, user } = command;`,
            `    try {`,
            `      return await this.${camelCase(fileBase)}Update${relName}UseCase.execute(user, id, relId);`,
            `    } catch (error) {`,
            `      handleCommandError(error, null, ${exceptionMsgName}.updateError);`,
            `      throw error;`,
            `    }`,
            `  }`,
            `}`,
            '',
          ];
          const updateHandlerFilePath = path.join(
            outDir,
            fileBase,
            'application',
            'commands',
            `update-${relFileName}`,
            `update-${fileBase}-${relFileName}.handler.ts`,
          );
          await writeFileWithDir(
            updateHandlerFilePath,
            updateHandlerImports.join('\n') + updateHandlerClass.join('\n'),
          );
        }
      }
    }
  }
};

const generateApiCommandsAndHandlers = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    // --- API COMMANDS (Custom Commands for each API) ---
    const apis = schema.parameters[table.name]?.apis || {};
    for (const [apiId, api] of Object.entries(apis)) {
      // Derive a class name, e.g., ProductResetProjectionStreamCommand
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );
      const commandClass = `${upperFirst(methodName)}${className}Command`;
      const handlerClass = `${upperFirst(methodName)}${className}Handler`;
      // Find params from the route (e.g., :stream)
      const paramMatches = [...apiId.matchAll(/:([a-zA-Z0-9_]+)/g)];
      const paramNames = paramMatches.map((m) => m[1]);
      const paramTypes = paramNames.map((p) =>
        api.params?.[p]?.type === 'number' ? 'number' : 'string',
      );

      // Generate the command class
      const apiCommandLines = [`// generate-commands`];
      apiCommandLines.push(`import { IUserToken } from 'src/shared/auth';`);
      apiCommandLines.push('');

      apiCommandLines.push(`export class ${commandClass} {`);
      apiCommandLines.push(`  constructor(`);
      apiCommandLines.push(`    public user: IUserToken,`);
      paramNames.forEach((p, i) => {
        apiCommandLines.push(`    public readonly ${p}: ${paramTypes[i]},`);
      });
      apiCommandLines.push(`  ) {}`);
      apiCommandLines.push(`}`);
      apiCommandLines.push('');

      // Write to file: ./commands/<api-command-name>.command.ts
      const apiCommandDir = path.join(
        outDir,
        fileBase,
        'application',
        'commands',
        `${kebabCase(methodName)}`,
      );
      const apiCommandFilePath = path.join(
        apiCommandDir,
        `${kebabCase(methodName)}-${fileBase}.command.ts`,
      );
      await writeFileWithDir(apiCommandFilePath, apiCommandLines.join('\n'));

      // Generate the handler class
      const apiHandlerLines = [`// generate-commands`];
      apiHandlerLines.push(
        `import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';`,
      );
      apiHandlerLines.push(
        `import { handleCommandError } from 'src/shared/application/commands';`,
      );
      apiHandlerLines.push(
        `import { I${className} } from '../../../domain/entities';`,
      );
      apiHandlerLines.push(
        `import { ${className}ExceptionMessage } from '../../../domain/exceptions';`,
      );
      apiHandlerLines.push(
        `import { ${commandClass} } from './${kebabCase(methodName)}-${fileBase}.command';`,
      );
      apiHandlerLines.push(
        `import { ${className}${upperFirst(methodName)}UseCase } from '../../usecases';`,
      );
      apiHandlerLines.push('');
      apiHandlerLines.push(`@CommandHandler(${commandClass})`);
      apiHandlerLines.push(
        `export class ${handlerClass} implements ICommandHandler<${commandClass}, I${className}> {`,
      );
      apiHandlerLines.push(
        `  constructor(private readonly ${camelCase(fileBase)}${upperFirst(methodName)}UseCase: ${className}${upperFirst(methodName)}UseCase) {}`,
      );
      apiHandlerLines.push('');
      apiHandlerLines.push(
        `  async execute(command: ${commandClass}): Promise<I${className}> {`,
      );
      apiHandlerLines.push(
        `    const { user${paramNames.length ? ', ' + paramNames.join(', ') : ''} } = command;`,
      );
      apiHandlerLines.push(`    try {`);
      apiHandlerLines.push(
        `      return await this.${camelCase(fileBase)}${upperFirst(methodName)}UseCase.execute(user${paramNames.length ? ', ' + paramNames.join(', ') : ''});`,
      );
      apiHandlerLines.push(`    } catch (error) {`);
      apiHandlerLines.push(
        `      handleCommandError(error, null, ${className}ExceptionMessage.updateError);`,
      );
      apiHandlerLines.push(`      throw error;`);
      apiHandlerLines.push(`    }`);
      apiHandlerLines.push(`  }`);
      apiHandlerLines.push(`}`);
      apiHandlerLines.push('');

      // Write to file: ./commands/<api-command-name>.handler.ts
      const apiHandlerFilePath = path.join(
        apiCommandDir,
        `${kebabCase(methodName)}-${fileBase}.handler.ts`,
      );
      await writeFileWithDir(apiHandlerFilePath, apiHandlerLines.join('\n'));
    }
  }
};

const generateCommandAndHandlerFiles = async (schema) => {
  await generateCreateCommandAndHandler(schema);
  await generateUpdateCommandAndHandler(schema);
  await generateDeleteCommandAndHandler(schema);
  await generateEnableDisableCommandsAndHandlers(schema);
  await generateStatusCommandAndHandler(schema);
  await generateRelationshipCommandsAndHandlers(schema);
  await generateApiCommandsAndHandlers(schema);
};

const generateCommandsBarrelIndex = async (schema) => {
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) continue;
    if (
      schema.parameters?.[table.name]?.cancel?.delete &&
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      Object.keys(schema.parameters?.[table.name]?.apis || {}).length === 0
    ) {
      continue;
    }
    const fileBase = kebabCase(table.name);
    const className = upperFirst(camelCase(table.name));
    // Collect handler imports and command exports
    const handlerImports = [];
    const commandExports = [];
    const commandsArr = [];

    if (!schema.parameters?.[table.name]?.cancel?.create) {
      // Standard handlers
      handlerImports.push(
        `import { Create${className}Handler } from './create/create-${fileBase}.handler';`,
      );
      commandsArr.push(`Create${className}Handler`);
      commandExports.push(
        `export * from './create/create-${fileBase}.command';`,
      );
    }
    if (!schema.parameters?.[table.name]?.cancel?.update) {
      handlerImports.push(
        `import { Update${className}Handler } from './update/update-${fileBase}.handler';`,
      );
      commandExports.push(
        `export * from './update/update-${fileBase}.command';`,
      );
      commandsArr.push(`Update${className}Handler`);
    }
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      handlerImports.push(
        `import { Delete${className}Handler } from './delete/delete-${fileBase}.handler';`,
      );
      commandExports.push(
        `export * from './delete/delete-${fileBase}.command';`,
      );

      commandsArr.push(`Delete${className}Handler`);
    }
    // Enable/Disable handlers and exports
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'enabled')
    ) {
      handlerImports.push(
        `import { Enable${className}Handler } from './enable/enable-${fileBase}.handler';`,
      );
      handlerImports.push(
        `import { Disable${className}Handler } from './disable/disable-${fileBase}.handler';`,
      );
      commandsArr.push(`Enable${className}Handler`);
      commandsArr.push(`Disable${className}Handler`);
      commandExports.push(
        `export * from './enable/enable-${fileBase}.command';`,
      );
      commandExports.push(
        `export * from './disable/disable-${fileBase}.command';`,
      );
    }
    if (
      !schema.parameters?.[table.name]?.cancel?.update &&
      table.cols.some((col) => col.name === 'status' && col.datatype === 'ENUM')
    ) {
      handlerImports.push(
        `import { Update${className}StatusHandler } from './update-status/update-${fileBase}-status.handler';`,
      );
      commandsArr.push(`Update${className}StatusHandler`);
      commandExports.push(
        `export * from './update-status/update-${fileBase}-status.command';`,
      );
    }
    // Relationship handlers
    if (Array.isArray(table._relationships)) {
      for (const rel of table._relationships) {
        const col = table.cols.find((c) => c.name === rel.childCol);
        if (!col || col.datatype === 'JSON') continue;
        if (schema.parameters?.[table.name]?.cancel?.update) {
          continue;
        }
        const relName = upperFirst(camelCase(singularize(rel.childCol)));
        const relFileName = kebabCase(relName);
        // Arrays: add/remove, Objects: update
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          handlerImports.push(
            `import { Add${relName}To${className}Handler } from './add-${relFileName}/add-${relFileName}-to-${fileBase}.handler';`,
          );
          handlerImports.push(
            `import { Remove${relName}From${className}Handler } from './remove-${relFileName}/remove-${relFileName}-from-${fileBase}.handler';`,
          );
          commandsArr.push(`Add${relName}To${className}Handler`);
          commandsArr.push(`Remove${relName}From${className}Handler`);
        } else if (rel.c_p === 'one' && rel.c_ch === 'many') {
          handlerImports.push(
            `import { Update${className}${relName}Handler } from './update-${relFileName}/update-${fileBase}-${relFileName}.handler';`,
          );
          commandsArr.push(`Update${className}${relName}Handler`);
        }
      }
    }
    // API handlers
    const apis = schema.parameters[table.name]?.apis || {};
    for (const [apiId, api] of Object.entries(apis)) {
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );
      const handlerClass = `${upperFirst(methodName)}${className}Handler`;
      handlerImports.push(
        `import { ${handlerClass} } from './${kebabCase(methodName)}/${kebabCase(methodName)}-${fileBase}.handler';`,
      );
      commandsArr.push(`${handlerClass}`);
      commandExports.push(
        `export * from './${kebabCase(methodName)}/${kebabCase(methodName)}-${fileBase}.command';`,
      );
    }
    // Command exports (for all commands)

    if (Array.isArray(table._relationships)) {
      for (const rel of table._relationships) {
        const col = table.cols.find((c) => c.name === rel.childCol);
        if (!col || col.datatype === 'JSON') continue;
        if (schema.parameters?.[table.name]?.cancel?.update) {
          continue;
        }
        const relName = upperFirst(camelCase(singularize(rel.childCol)));
        const relFileName = kebabCase(relName);
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          commandExports.push(
            `export * from './add-${relFileName}/add-${relFileName}-to-${fileBase}.command';`,
          );
          commandExports.push(
            `export * from './remove-${relFileName}/remove-${relFileName}-from-${fileBase}.command';`,
          );
        } else if (rel.c_p === 'one' && rel.c_ch === 'many') {
          commandExports.push(
            `export * from './update-${relFileName}/update-${fileBase}-${relFileName}.command';`,
          );
        }
      }
    }

    // Compose the index.ts
    const lines = [`// generate-commands`];
    lines.push(...handlerImports);
    lines.push('');
    lines.push('// application/commands/index.ts');
    lines.push(`export const ${className}Commands = [`);
    lines.push('  ' + commandsArr.join(',\n  ') + ',');
    lines.push(``);
    lines.push('];\n');
    lines.push(...commandExports);
    lines.push('');
    // Write the index.ts
    const indexPath = path.join(
      outDir,
      fileBase,
      'application',
      'commands',
      'index.ts',
    );
    await writeFileWithDir(indexPath, lines.join('\n'), true);
  }
};

// Add to main create
module.exports.create = async (schema) => {
  await generateCommandAndHandlerFiles(schema);
  await addIndexTs(schema);
  await generateCommandsBarrelIndex(schema);
};
