const path = require('path');

const {
  upperFirst,
  camelCase,
  pluralize,
} = require('../../../utils/word-utils');

const {
  getSpecialColumns,
  getComplexObjects,
} = require('../../utils/model-utils');

function repositoryHydrateComplexObjects(schema, table) {
  const lines = [];

  const className = upperFirst(camelCase(table.name));

  const primaryCol = table.cols.find((col) => col.name !== 'tenant' && col.pk);

  const complexObjects = getComplexObjects(schema, table).filter(
    (item) => item.type !== 'simple',
  );

  const specialCols = getSpecialColumns(schema, table);

  lines.push(`  /**
   * Hydrates a ${className} to a complete I${className} domain object.
   * This abstraction supports multiple data sources: EventStore snapshots,
   * rebuilt events, SQL projections, or Redis fallback during migration.
   * @private
   */`);

  lines.push(`  private async hydrateStored${className}(`);

  lines.push(`    user: IUserToken,`);
  lines.push(`    stored${className}: Snapshot${className}Props,`);
  lines.push(`    logContext: Record<string, unknown>,`);

  lines.push(`  ): Promise<I${className}> {`);

  lines.push(`    try {`);

  if ([...complexObjects, ...specialCols].length) {
    lines.push(`      // Hydrate complex domain objects in parallel`);
    lines.push(
      `      const [${[...complexObjects, ...specialCols].map((item) => `${camelCase(item.col.name)}`).join(', ')}] = await Promise.all([`,
    );
    [...complexObjects, ...specialCols].forEach((item) => {
      switch (item.type) {
        case 'recordset':
          lines.push(
            `        Promise.resolve(stored${className}.${camelCase(item.col.name)}),`,
          );
          break;
        case 'complex':
          lines.push(
            `        stored${className}.${camelCase(item.col.name)} ? this.get${upperFirst(camelCase(item.rel.parentTable))}(user, stored${className}.${camelCase(item.col.name)}) : null,`,
          );
          break;
        case 'special':
          if (item.rel.c_p === 'many' && item.rel.c_ch === 'many') {
            lines.push(
              `        stored${className}.${camelCase(item.col.name)} && stored${className}.${camelCase(item.col.name)}.length > 0
          ? this.get${upperFirst(camelCase(pluralize(item.rel.parentTable)))}(user, stored${className}.${camelCase(item.col.name)})
          : [],`,
            );
          } else {
            lines.push(
              `        this.get${upperFirst(camelCase(item.rel.parentTable))}(user, stored${className}.${camelCase(item.col.name)}),`,
            );
          }
          break;
        default:
          lines.push(item.type);
          break;
      }
    });

    lines.push(`      ]);`);
    lines.push(``);
    lines.push(
      `      // Domain invariant validation - ensure required aggregates are present`,
    );
    [...complexObjects, ...specialCols]
      .filter((item) => item.col.nn)
      .forEach((item) => {
        lines.push(`      if (!${camelCase(item.col.name)}) {`);
        lines.push(
          `        throw new ${className}DomainException(${className}ExceptionMessage.${item.col.name}NotFound);`,
        );
        lines.push(`      }`);
        lines.push(``);
      });
  }

  lines.push(`      // Construct the complete domain object`);
  if ([...complexObjects, ...specialCols].length) {
    lines.push(`     return {`);
  } else {
    lines.push(`     return Promise.resolve({`);
  }
  table.cols.forEach((col) => {
    if (
      [...complexObjects, ...specialCols].find(
        (item) => item.col.name === col.name,
      )
    ) {
      lines.push(`        ${camelCase(col.name)},`);
    } else {
      lines.push(
        `        ${camelCase(col.name)}: stored${className}.${camelCase(col.name)},`,
      );
    }
  });

  if ([...complexObjects, ...specialCols].length) {
    lines.push(`     };`);
  } else {
    lines.push(`     });`);
  }

  lines.push(``);
  lines.push(`    } catch (error) {`);
  lines.push(`      this.logger.error(`);
  lines.push(`        {`);
  lines.push(`          ...logContext,`);
  lines.push(
    `          ${camelCase(className)}Code: stored${className}.${camelCase(primaryCol.name)},`,
  );
  lines.push(
    `          error: error instanceof Error ? error.message : 'Unknown error',`,
  );
  lines.push(`        },`);
  lines.push(
    `        \`Failed to hydrate ${camelCase(className)} entity: \${stored${className}.${camelCase(primaryCol.name)}}\`,`,
  );
  lines.push(`      );`);
  lines.push(`      throw error;`);

  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  return lines;
}

function ormRepositoryHydrateComplexObjects(schema, table) {
  const lines = [];

  const className = upperFirst(camelCase(table.name));

  const primaryCol = table.cols.find((col) => col.name !== 'tenant' && col.pk);

  const complexObjects = getComplexObjects(schema, table).filter(
    (item) => item.type !== 'simple',
  );

  const specialCols = getSpecialColumns(schema, table);

  lines.push(`  /**`);
  lines.push(
    `   * Hydrates a ${className}Entity to a complete I${className} domain object`,
  );
  lines.push(`   * @private`);
  lines.push(`   */`);
  if ([...complexObjects, ...specialCols].length) {
    lines.push(`  private async hydrate${className}Entity(`);
  } else {
    lines.push(`  public hydrate${className}Entity(`);
  }
  lines.push(`    user: IUserToken,`);
  lines.push(`    entity: ${className}Entity,`);
  lines.push(`    logContext: Record<string, unknown>,`);
  if ([...complexObjects, ...specialCols].length) {
    lines.push(`  ): Promise<I${className}> {`);
  } else {
    lines.push(`  ): I${className} {`);
  }
  lines.push(`    try {`);

  if ([...complexObjects, ...specialCols].length) {
    lines.push(`      // Hydrate complex domain objects in parallel`);
    lines.push(
      `      const [${[...complexObjects, ...specialCols].map((item) => `${camelCase(item.col.name)}`).join(', ')}] = await Promise.all([`,
    );
    [...complexObjects, ...specialCols].forEach((item) => {
      if (item.type === 'complex') {
        lines.push(
          `        entity.${camelCase(item.col.name)} ? this.get${upperFirst(camelCase(item.rel.parentTable))}(user, entity.${camelCase(item.col.name)}) : null,`,
        );
      } else if (item.type === 'special') {
        if (item.rel.c_p === 'many' && item.rel.c_ch === 'many') {
          lines.push(
            `        entity.${camelCase(item.col.name)} && entity.${camelCase(item.col.name)}.length > 0
          ? this.get${upperFirst(camelCase(pluralize(item.rel.parentTable)))}(user, entity.${camelCase(item.col.name)})
          : [],`,
          );
        } else {
          lines.push(
            `        this.get${upperFirst(camelCase(item.rel.parentTable))}(user, entity.${camelCase(item.col.name)}),`,
          );
        }
      }
    });

    lines.push(`      ]);`);
    lines.push(``);
    lines.push(
      `      // Domain invariant validation - ensure required aggregates are present`,
    );
    [...complexObjects, ...specialCols]
      .filter((item) => item.col.nn)
      .forEach((item) => {
        lines.push(`      if (!${camelCase(item.col.name)}) {`);
        lines.push(
          `        throw new ${className}DomainException(${className}ExceptionMessage.${item.col.name}NotFound);`,
        );
        lines.push(`      }`);
        lines.push(``);
      });
  }

  lines.push(`      // Construct the complete domain object`);
  lines.push(`     return {`);
  table.cols.forEach((col) => {
    if (
      [...complexObjects, ...specialCols].find(
        (item) => item.col.name === col.name,
      )
    ) {
      lines.push(`        ${camelCase(col.name)},`);
    } else {
      lines.push(
        `        ${camelCase(col.name)}: entity.${camelCase(col.name)},`,
      );
    }
  });

  lines.push(`     };`);
  lines.push(``);
  lines.push(`    } catch (error) {`);
  lines.push(`      this.logger.error(`);
  lines.push(`        {`);
  lines.push(`          ...logContext,`);
  lines.push(
    `          ${camelCase(className)}Code: entity.${camelCase(primaryCol.name)},`,
  );
  lines.push(
    `          error: error instanceof Error ? error.message : 'Unknown error',`,
  );
  lines.push(`        },`);
  lines.push(
    `        \`Failed to hydrate ${camelCase(className)} entity: \${entity.${camelCase(primaryCol.name)}}\`,`,
  );
  lines.push(`      );`);
  lines.push(`      throw error;`);

  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  return lines;
}

module.exports = {
  repositoryHydrateComplexObjects,
  ormRepositoryHydrateComplexObjects,
};
