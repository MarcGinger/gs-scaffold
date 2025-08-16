const {
  upperFirst,
  camelCase,
  pluralize,
} = require('../../../utils/word-utils');
const { getTableProperties } = require('./repository-utils');

/**
 * Helper function to generate consistent not-implemented method signature
 * @param {string} methodName - Name of the method
 * @param {Array} parameters - Array of parameter definitions
 * @param {string} returnType - Return type of the method
 * @returns {Array} Array of code lines for method signature
 */
const generateMongoMethodSignature = (methodName, parameters, returnType) => {
  const lines = [];
  const eslintDisable =
    parameters.length > 1
      ? '@typescript-eslint/require-await, @typescript-eslint/no-unused-vars'
      : '@typescript-eslint/require-await';

  lines.push(`  // eslint-disable-next-line ${eslintDisable}`);
  lines.push(`  async ${methodName}(`);

  parameters.forEach((param, index) => {
    if (index > 0) {
      lines.push(
        '    // eslint-disable-next-line @typescript-eslint/no-unused-vars',
      );
    }
    lines.push(`    ${param},`);
  });

  lines.push(`  ): ${returnType} {`);
  return lines;
};

/**
 * Helper function to generate consistent not-implemented exception throw
 * @param {string} className - Class name for exception
 * @returns {Array} Array of code lines for exception throw
 */
const generateNotImplementedException = (className) => {
  return [
    `    throw new ${className}DomainException(${className}ExceptionMessage.notImplemented);`,
  ];
};

function mongoRepositoryGet(schema, table) {
  const { className, primaryCol } = getTableProperties(schema, table);
  const lines = [];

  lines.push('');
  lines.push(
    ...generateMongoMethodSignature(
      'get',
      ['user: IUserToken', `identifier: ${primaryCol.type}`],
      `Promise<I${className} | undefined>`,
    ),
  );
  lines.push(...generateNotImplementedException(className));
  lines.push('  }');
  lines.push('');

  return lines;
}

function mongoRepositoryGetByCodes(schema, table) {
  const { className, primaryCol } = getTableProperties(schema, table);
  const lines = [];

  lines.push(
    ...generateMongoMethodSignature(
      'getByCodes',
      [
        'user: IUserToken',
        `${camelCase(pluralize(primaryCol.name))}: ${primaryCol.type}[]`,
      ],
      `Promise<I${className}[]>`,
    ),
  );
  lines.push(...generateNotImplementedException(className));
  lines.push('  }');
  lines.push('');

  return lines;
}

function mongoRepositoryList(schema, table) {
  const { className } = getTableProperties(schema, table);
  const lines = [];

  lines.push(
    ...generateMongoMethodSignature(
      'list',
      ['user: IUserToken', `pageOptions: List${className}PropsOptions = {}`],
      `Promise<${className}Page>`,
    ),
  );

  lines.push(
    '    const options: List' + className + 'PropsOptions = pageOptions || {};',
  );
  lines.push('    if (!options.page) options.page = 1;');
  lines.push('    if (!options.size) options.size = 250;');
  lines.push(...generateNotImplementedException(className));
  lines.push('  }');
  lines.push('');

  return lines;
}

function mongoRepositorySave(schema, table) {
  const { className, primaryCol } = getTableProperties(schema, table);
  const lines = [];

  lines.push(
    '  // This is the implementation that overrides the abstract method in the base class',
  );
  lines.push(
    '  // to handle the specific I' +
      className +
      ' to I' +
      className +
      'Stream conversion',
  );
  lines.push('  // eslint-disable-next-line @typescript-eslint/require-await');
  lines.push('  protected async save(');
  lines.push('    user: IUserToken,');
  lines.push('    data: ' + className + ',');

  lines.push('  ): Promise<I' + className + '> {');
  lines.push('    if (!user) {');
  lines.push(
    '      throw new ' +
      className +
      'DomainException(' +
      className +
      'ExceptionMessage.userRequiredForOperation);',
  );
  lines.push('    }');

  if (primaryCol) {
    lines.push('    if (!data || !data.' + camelCase(primaryCol.name) + ') {');
    lines.push(
      '      throw new ' +
        className +
        'DomainException(' +
        className +
        'ExceptionMessage.field' +
        upperFirst(camelCase(primaryCol.name)) +
        'Required);',
    );
    lines.push('    }');
  }

  lines.push(...generateNotImplementedException(className));
  lines.push('  }');
  lines.push('');

  return lines;
}

function mongoRepositoryDelete(schema, table) {
  const { className, primaryCol } = getTableProperties(schema, table);
  const lines = [];

  lines.push('  async delete(');
  lines.push('    user: IUserToken,');
  lines.push('    identifier: ' + primaryCol.type + ',');
  lines.push('  ): Promise<void> {');
  lines.push('    const startTime = Date.now();');

  if (primaryCol) {
    lines.push('    const code = identifier;');
  }

  lines.push('    const logContext = this.createLogContext(');
  lines.push('      COMPONENT_NAME,');
  lines.push("      'delete',");
  lines.push(
    '      code' + (primaryCol.type !== 'string' ? '.toString()' : '') + ',',
  );
  lines.push('      user,');
  lines.push('    );');
  lines.push('');
  lines.push("    this.logger.debug(logContext, 'Delete operation started');");
  lines.push('');
  lines.push('    try {');
  lines.push('      const aggregate = await this.getById(user, code);');
  lines.push(
    '      this.validateEntityExists(aggregate, ' +
      className +
      'ExceptionMessage.notFound);',
  );
  lines.push('      aggregate.markForDeletion(user);');
  lines.push('');
  lines.push(
    ...generateNotImplementedException(className).map((line) => '  ' + line),
  );
  lines.push('');
  lines.push('    } catch (error) {');
  lines.push('      const duration = Date.now() - startTime;');
  lines.push(
    '      const errorContext = this.createErrorContext(logContext, error as Error, duration);',
  );
  lines.push(
    '      const errorMessage = this.extractErrorMessage(error, ' +
      className +
      'ExceptionMessage.deleteError);',
  );
  lines.push(
    '      this.handleError(error as Error, user, errorContext, errorMessage, duration);',
  );
  lines.push('    }');
  lines.push('  }');
  lines.push('');

  return lines;
}

module.exports = {
  mongoRepositoryGet,
  mongoRepositoryList,
  mongoRepositoryGetByCodes,
  mongoRepositorySave,
  mongoRepositoryDelete,
};
