const path = require(`path`);
const { writeFileWithDir, createIndexFilesFromDirectory } = require(
  `../utils/file-utils`,
);
const { buildImportLines, shouldSkipTable } = require(
  `../utils/generator-utils`,
);

const { kebabCase, upperFirst, camelCase, singularize, sentenceCase } = require(
  `../utils/word-utils`,
);
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require(`../utils/general-utils`);

function generateCode(noVowels, id) {
  const code = id.toString().padStart(4, `0`);
  return `${noVowels}${code}`;
}

const create = async (schema, errors) => {
  const indexPaths = [];
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (errors && errors[table.name]) {
      const name = table.name;
      const className = upperFirst(camelCase(name));
      errors[table.name].notImplemented = {
        message: `This operation is not implemented for ${className}`,
        description: `The requested operation is not yet implemented for ${className} entities`,
        code: `NOT_IMPLEMENTED_${className.toUpperCase()}`,
        exception: `NotImplementedException`,
        statusCode: `501`,
        domain: `true`,
      };
      errors[table.name].notFound = {
        message: `${className} not found`,
        description: `The requested ${className} entity could not be found in the system`,
        code: `${className.toUpperCase()}_NOT_FOUND`,
        exception: `NotFoundException`,
        statusCode: `404`,
        domain: `true`,
      };
      errors[table.name].createError = {
        message: `Invalid ${className} details creating an item`,
        description: `The provided ${className} details are invalid or incomplete for creation`,
        code: `INVALID_${className.toUpperCase()}_CREATE_DETAILS`,
        exception: `BadRequestException`,
        statusCode: `400`,
        domain: `true`,
      };
      errors[table.name].updateError = {
        message: `Invalid ${className} details updating an item`,
        description: `The provided ${className} details are invalid or incomplete for update`,
        code: `INVALID_${className.toUpperCase()}_UPDATE_DETAILS`,
        exception: `BadRequestException`,
        statusCode: `400`,
        domain: `true`,
      };
      errors[table.name].deleteError = {
        message: `Invalid ${className} details for deleting an item`,
        description: `The provided ${className} details are invalid or the entity cannot be deleted due to business rules`,
        code: `INVALID_${className.toUpperCase()}_DELETE_DETAILS`,
        exception: `BadRequestException`,
        statusCode: `400`,
        domain: `true`,
      };

      const noVowels = (table.name.replace(/[aeiou]/gi, ``) + `AAAA`)
        .slice(0, 3)
        .toUpperCase();
      const messages = [];
      const lines = [];
      lines.push(`import { IException } from 'src/shared/domain/exceptions';`);
      lines.push(``);
      lines.push(
        `export const ${className}ExceptionMessage: Record<string, IException> = {`,
      );
      Object.entries(errors[table.name]).forEach(([key, value]) => {
        if (messages.includes(key)) {
          return;
        }

        messages.push(key);
        lines.push(`  ${key}: {`);
        if (typeof value === `object` && value !== null) {
          Object.entries(value).forEach(([subKey, subVal]) => {
            // if (subKey === `code`) {
            //   lines.push(`    ${subKey}: \`${subVal.toUpperCase()}\`,`);
            // } else {
            lines.push(`    ${subKey}: \`${subVal}\`,`);
            // }
          });
        } else {
          lines.push(
            `    message: \`Invalid ${sentenceCase(upperFirst(value))} details\``,
          );
        }

        lines.push(`  },`);
      });

      lines.push(`};`);
      lines.push(``);
      if (
        schema.excluded?.includes(`${kebabCase(name)}-exception.message.ts`)
      ) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-exception.message.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(
        path.join(
          outDir,
          kebabCase(name),
          `domain`,
          `exceptions`,
          `${kebabCase(name)}-exception.message.ts`,
        ),
        lines.join(`\n`),
      );
      const errorLines = [``];
      errorLines.push(
        `import { IException, DomainException } from 'src/shared/domain/exceptions';`,
      );
      errorLines.push(``);
      errorLines.push(`/**
 * Domain exception for ${className} errors.
 * Carries a user-friendly message and an error code.
 */

export class ${className}DomainException extends DomainException {
  constructor(exceptionMessage: IException) {
    super(exceptionMessage, '${className}');
  }
}

`);

      if (schema.excluded?.includes(`${kebabCase(name)}-domain.exception.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-domain.exception.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(
        path.join(
          outDir,
          kebabCase(name),
          `domain`,
          `exceptions`,
          `${kebabCase(name)}-domain.exception.ts`,
        ),
        errorLines.join(`\n`),
      );

      await createIndexFilesFromDirectory(
        path.join(outDir, kebabCase(name), `domain`, `exceptions`),
      );
    }
  }
};

exports.create = create;
