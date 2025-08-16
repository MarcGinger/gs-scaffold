const path = require('path');
const {
  writeFileWithDir,
  copyDirectory,
  deleteDirectory,
  createIndexFilesFromDirectory,
} = require('../utils/file-utils');
const {
  buildImportLines,
  isJoinTableValid,
} = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  snakeCase,
  pluralize,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

const create = async (schema) => {
  logger.info('Starting event store generation...');
  const tables = Object.values(schema.tables || {})
    .filter(
      (t) =>
        schema.parameters?.[t.name]?.store?.read === 'sql' ||
        schema.parameters?.[t.name]?.store?.write === 'sql' ||
        schema.parameters?.[t.name]?.store?.list === 'sql',
    )
    .map((t) => t.name);

  if (tables.length || schema.parameters?.services?.sql) {
    logger.info(`Found sql service`);
    await Promise.all([entities(schema), ormConfigModule(schema)]);
    logger.info('ORM generation completed successfully');
  } else {
    const dirArray = schema.sourceDirectory.split(path.sep);
    dirArray.pop();

    deleteDirectory(
      path.resolve(
        dirArray.join(path.sep),
        'infrastructure',
        'configuration',
        'typeorm',
      ),
    );
    logger.info('No orm tables found in schema, skipping orm generation');
  }
};

const entities = async (schema) => {
  const indexPaths = [];
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);

  const entityImports = [];
  if (
    Object.values(schema.parameters).find(
      (p) => p.store?.write === 'eventstream' && p.store?.list === 'sql',
    )
  ) {
    const catchup = [
      `import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'check_point', schema: '${snakeCase(schema.service.module.toLowerCase())}' })
export class CheckPointEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'bigint' })
  revision: string;
}`,
    ];

    const dirArray = schema.sourceDirectory.split(path.sep);

    dirArray.pop();
    const catchupDir = schema.sourceDirectory;

    await writeFileWithDir(
      path.join(
        catchupDir,
        'shared',
        'infrastructure',
        'entities',
        `check-point.entity.ts`,
      ),
      catchup.join('\n'),
    );
    indexPaths.push(`export { CheckPointEntity } from './check-point.entity';`);

    entityImports.push({
      entity: `CheckPointEntity`,
      path: `./shared/infrastructure/entities`,
    });

    createIndexFilesFromDirectory(
      path.join(catchupDir, 'shared', 'infrastructure', 'entities'),
    );
  }

  const entityList = Object.values(tables)
    .filter(
      (table) =>
        schema.parameters?.[table.name]?.store?.read === 'sql' ||
        schema.parameters?.[table.name]?.store?.write === 'sql' ||
        schema.parameters?.[table.name]?.store?.list === 'sql',
    )
    .map((table) => table.name);

  for (const [tableId, table] of Object.entries(tables)) {
    try {
      logger.info(`=== PROCESSING TABLE: ${table.name} ===`);

      if (!entityList.includes(table.name)) {
        logger.warn(
          `Table ${table.name} is not included in entity list. Skipping...`,
        );
        continue;
      }

      // Validate table structure
      if (!table.cols || !Array.isArray(table.cols)) {
        logger.error(
          `Table ${table.name} has invalid or missing cols property`,
        );
        continue;
      }

      if (!table._relationships || !Array.isArray(table._relationships)) {
        logger.warn(
          `Table ${table.name} has invalid or missing _relationships property, initializing as empty array`,
        );
        table._relationships = [];
      }

      if (table.cols.find((c) => c.pk && c.datatype.toUpperCase() === 'JSON')) {
        logger.warn(
          `Table ${table.name} contains JSON columns, which are not supported in TypeORM entities. Skipping...`,
        );
        continue;
      }

      const fileBase = kebabCase(table.name);
      const className = upperFirst(camelCase(table.name));

      logger.info(`File base: ${fileBase}, Class name: ${className}`);

      indexPaths.push(
        `export { ${className}Entity } from './${fileBase}/infrastructure/entities';`,
      );

      const filePath = path.join(
        outDir,
        kebabCase(className),
        'infrastructure',
        'entities',
        `${fileBase}.entity.ts`,
      );
      const imports = {};
      const relTs = [];

      imports['typeorm'] = new Set(['Entity', 'Column']);

      logger.info(`Processing table ${table.name} for entity generation...`);

      // ===== RELATIONSHIP PROCESSING =====
      logger.info(`Starting relationship processing for table ${table.name}`);
      logger.info(`Found ${table._relationships.length} total relationships`);

      const parentRelationships = table._relationships.filter(
        (i) => i.parentTable === table.name,
      );
      logger.info(
        `Found ${parentRelationships.length} parent relationships for table ${table.name}`,
      );

      parentRelationships.forEach((rel, relIndex) => {
        try {
          logger.info(
            `Processing relationship ${relIndex + 1}/${parentRelationships.length}`,
          );
          logger.info(`Relationship details:`, {
            name: rel.name,
            parentTable: rel.parentTable,
            childTable: rel.childTable,
            parentCol: rel.parentCol,
            childCol: rel.childCol,
            c_p: rel.c_p,
            c_ch: rel.c_ch,
            isParent: rel.isParent,
            isChild: rel.isChild,
            isObject: rel.isObject,
          });

          const {
            isParent,
            isChild,
            parent,
            child,
            parentPlural,
            parentCol,
            parentClass,
            parentTable,
            childPlural,
            childCol,
            childClass,
            childTable,
            c_p,
            c_ch,
            isObject,
          } = rel;

          // Validate relationship properties
          if (!parentTable || !childTable) {
            logger.warn(
              `Skipping relationship with missing parent/child table:`,
              rel,
            );
            return;
          }

          // Validate schema parameters
          if (!schema.parameters[parentTable]) {
            logger.warn(
              `Missing schema parameters for parentTable: ${parentTable}`,
            );
            return;
          }

          if (!schema.parameters[childTable]) {
            logger.warn(
              `Missing schema parameters for childTable: ${childTable}`,
            );
            return;
          }

          const parentProperties = schema.parameters[parentTable]?.store || {};
          const childProperties = schema.parameters[childTable]?.store || {};

          logger.info(`Parent properties:`, parentProperties);
          logger.info(`Child properties:`, childProperties);

          logger.info(`Checking if join table is valid...`);
          const joinTableValid = isJoinTableValid(
            schema.parameters[parentTable]?.store,
            schema.parameters[childTable]?.store,
          );
          logger.info(`Join table valid: ${joinTableValid}`);

          if (joinTableValid) {
            if (isChild) {
              logger.info(`Processing child relationship...`);
              if (entityList.includes(parentTable)) {
                logger.info(`Parent table ${parentTable} is in entity list`);

                if (c_p === 'many' && c_ch === 'many') {
                  logger.info(
                    `Processing many-to-many relationship as child...`,
                  );
                  const pkCol = table.cols.find((c) => c.pk);
                  if (!pkCol) {
                    logger.error(
                      `No primary key column found for table ${table.name}`,
                    );
                    return;
                  }

                  imports['typeorm'].add('ManyToMany');
                  imports[
                    `../../../${kebabCase(parentClass)}/infrastructure/entities`
                  ] = new Set([parentClass + 'Entity']);

                  relTs.push(
                    `  @ManyToMany(() => ${parentClass}Entity, (${camelCase(
                      parentClass,
                    )}) => ${camelCase(parentClass)}.${camelCase(childPlural)})`,
                  );
                  relTs.push(
                    `  @JoinTable({
        name: '${rel.name}',
        joinColumn: { name: '${childCol}', referencedColumnName: '${pkCol.name}' },
        inverseJoinColumn: { name: '${parentCol}', referencedColumnName: '${parentCol}' }
      })`,
                  );
                  relTs.push(
                    `  ${camelCase(parentPlural)}: ${parentClass}Entity[];`,
                  );
                  relTs.push(``);
                } else {
                  logger.info(
                    `Processing one-to-many relationship as child...`,
                  );
                  imports['typeorm'].add('JoinColumn');
                  imports['typeorm'].add('ManyToOne');
                  imports[
                    `../../../${kebabCase(parentClass)}/infrastructure/entities`
                  ] = new Set([parentClass + 'Entity']);
                  relTs.push(`TODO`);
                  // relTs.push(
                  //   `  @ManyToOne(() => ${parentClass}Entity, (${camelCase(parentClass)}) => ${camelCase(parentClass)}.${camelCase(childPlural)})`,
                  // );
                  // relTs.push(
                  //   `  @JoinColumn({ name: '${childCol}', referencedColumnName: '${parentCol}' })`,
                  // );
                  relTs.push(`  ${camelCase(parent)}: ${parentClass}Entity;`);
                  relTs.push(``);
                }
              } else {
                logger.info(
                  `Parent table ${parentTable} is not in entity list`,
                );
              }
            }
            if (isParent) {
              logger.info(`Processing parent relationship...`);

              if (c_p === 'many' && c_ch === 'many') {
                logger.info(
                  `Processing many-to-many relationship as parent...`,
                );
                imports['typeorm'].add('ManyToMany');
                imports[
                  `../../../${kebabCase(childClass)}/infrastructure/entities`
                ] = new Set([childClass + 'Entity']);

                relTs.push(
                  `  @ManyToMany(() => ${childClass}Entity, (${camelCase(
                    childClass,
                  )}) => ${camelCase(childClass)}.${camelCase(childCol)})`,
                );
                relTs.push(
                  `  ${camelCase(childClass)}${upperFirst(camelCase(childCol))}: ${childClass}Entity[];`,
                );
                relTs.push(``);
              } else {
                logger.info(`Processing one-to-many relationship as parent...`);
                imports['typeorm'].add('OneToMany');
                imports[
                  `../../../${kebabCase(childClass)}/infrastructure/entities`
                ] = new Set([childClass + 'Entity']);

                const propName = camelCase(childCol);
                relTs.push(
                  `  @OneToMany(() => ${childClass}Entity, (${camelCase(childClass)}) => ${camelCase(childClass)}.${camelCase(childCol)})`,
                );
                relTs.push(
                  `  ${pluralize(camelCase(childClass))}: ${childClass}Entity[];`,
                );
                relTs.push(``);
              }
            }
          } else {
            logger.info(
              `Join table not valid, skipping relationship generation`,
            );
          }

          logger.info(`Completed processing relationship ${relIndex + 1}`);
        } catch (relError) {
          logger.error(
            `Error processing relationship ${relIndex + 1} for table ${table.name}:`,
            relError,
          );
          logger.error(`Relationship data:`, rel);
        }
      });

      logger.info(`Completed relationship processing for table ${table.name}`);

      // ===== COLUMN PROCESSING =====
      logger.info(`Starting column processing for table ${table.name}`);
      logger.info(`Found ${table.cols.length} columns to process`);

      const lines = [];
      imports['typeorm'].add('PrimaryColumn');
      lines.push(
        `  @PrimaryColumn({ name: 'tenant_id', type: 'varchar', length: 60 })`,
      );
      lines.push(`  tenantId: string;`);
      lines.push(``);
      table.cols
        .filter((col) => col.name !== 'tenantId')
        .forEach((col, colIndex) => {
          try {
            logger.info(
              `Processing column ${colIndex + 1}/${table.cols.length}: ${col.name} (${col.datatype})`,
            );

            // Validate column structure
            if (!col.name || !col.datatype) {
              logger.error(
                `Column ${colIndex + 1} has invalid structure:`,
                col,
              );
              return;
            }

            if (
              col.datatype === 'ENUM' ||
              (col.datatype === 'JSON' && col.enum)
            ) {
              logger.info(`Adding enum import for column ${col.name}`);
              addImport(
                imports,
                '../../domain/entities',
                `${upperFirst(camelCase(table.name))}${upperFirst(camelCase(col.name))}Enum`,
              );
            }

            const rel = table._relationships.find(
              (rel) => col.name === rel.childCol,
            );

            if (rel) {
              logger.info(`Column ${col.name} has relationship:`, {
                parentTable: rel.parentTable,
                childTable: rel.childTable,
                datatype: col.datatype,
                c_p: rel.c_p,
                c_ch: rel.c_ch,
              });

              if (col.datatype === 'JSON') {
                logger.info(`Processing JSON column with relationship...`);
                addImport(
                  imports,
                  `../../../${kebabCase(rel.parentClass)}/domain/properties`,
                  `Snapshot${rel.parentClass}Props`,
                );

                if (col.defaultvalue === 'object()') {
                  lines.push(`  @Column({`);
                  lines.push(`    name: '${snakeCase(col.name)}',`);
                  lines.push(`    type: 'jsonb',`);
                  lines.push(`    nullable: true,`);
                  lines.push(`  })`);
                  lines.push(
                    `  ${camelCase(col.name)}: Record<string, Snapshot${rel.parentClass}Props>;`,
                  );
                } else {
                  const isArray = rel.c_p === 'many' && rel.c_ch === 'many';
                  lines.push(`  @Column({`);
                  lines.push(`    name: '${snakeCase(col.name)}',`);
                  lines.push(`    type: 'jsonb',`);
                  lines.push(`    nullable: true,`);
                  if (isArray) {
                    lines.push(`    default: '[]',`);
                  }
                  lines.push(`  })`);
                  lines.push(
                    `  ${camelCase(col.name)}: Snapshot${rel.parentClass}Props${isArray ? '[]' : ''};`,
                  );
                }
                lines.push(``);
              } else if (rel.c_p === 'many' && rel.c_ch === 'many') {
                logger.info(`Processing many-to-many column relationship...`);
                if (entityList.includes(rel.parentTable)) {
                  logger.info(
                    `Parent table ${rel.parentTable} is in entity list for many-to-many`,
                  );

                  const parentClass = rel.parentClass;
                  const parentPlural = rel.parentPlural;
                  const childCol = rel.childCol;
                  const parentCol = rel.parentCol;

                  if (
                    isJoinTableValid(
                      schema.parameters[rel.parentTable]?.store,
                      schema.parameters[rel.childTable]?.store,
                    )
                  ) {
                    logger.info(
                      `Join table valid for many-to-many relationship`,
                    );
                    addImport(imports, 'typeorm', ['ManyToMany', 'JoinTable']);
                    addImport(
                      imports,
                      `../../../${kebabCase(parentClass)}/infrastructure/entities`,
                      `${parentClass}Entity`,
                    );

                    const pkCol = table.cols.find((c) => c.pk);
                    if (!pkCol) {
                      logger.error(
                        `No primary key found for table ${table.name}`,
                      );
                      return;
                    }

                    lines.push(
                      `  @ManyToMany(() => ${parentClass}Entity, (${camelCase(parentClass)}) => ${camelCase(parentClass)}.${camelCase(rel.childClass)}${upperFirst(camelCase(rel.childCol))})`,
                    );
                    lines.push(`  @JoinTable({`);
                    lines.push(
                      `    name: '${snakeCase(rel.childTable)}_${rel.name}',`,
                    );
                    lines.push(`    joinColumns: [`);
                    lines.push(
                      `      { name: '${snakeCase(rel.childTable)}_${pkCol.name}', referencedColumnName: '${pkCol.name}' },`,
                    );
                    lines.push(
                      `      { name: '${snakeCase(rel.childTable)}_tenant_id', referencedColumnName: 'tenantId' },`,
                    );

                    lines.push(`    ],`);

                    lines.push(`    inverseJoinColumns: [`);
                    lines.push(
                      `      { name: '${snakeCase(rel.parentTable)}_${snakeCase(parentCol)}', referencedColumnName: '${camelCase(parentCol)}' },`,
                    );
                    lines.push(
                      `      { name: '${snakeCase(rel.parentTable)}_tenant_id', referencedColumnName: 'tenantId' },`,
                    );
                    lines.push(`    ],`);
                    lines.push(`  })`);
                    lines.push(
                      `  ${camelCase(childCol)}${col.nn ? '' : '?'}: ${parentClass}Entity[];`,
                    );
                  } else {
                    logger.info(`Join table not valid, using array column`);
                    lines.push(
                      `  @Column({ name: '${snakeCase(rel.childCol)}', type: 'text', array: true, nullable: ${col.nn ? 'false' : 'true'} })`,
                    );
                    lines.push(
                      `  ${camelCase(rel.childCol)}${col.nn ? '' : '?'}: string[];`,
                    );
                  }
                  lines.push('');
                } else {
                  logger.info(
                    `Parent table ${rel.parentTable} not in entity list, using JSON column`,
                  );
                  lines.push(`  @Column({`);
                  lines.push(`    type: 'json',`);
                  lines.push(`    nullable: true,`);
                  lines.push(`  })`);
                  lines.push(`  ${camelCase(rel.childCol)}: ${col.type}[];`);
                  lines.push(``);
                }
              } else {
                logger.info(`Processing single relationship column...`);
                if (entityList.includes(rel.parentTable)) {
                  logger.info(
                    `Parent table ${rel.parentTable} is in entity list for single relationship`,
                  );

                  const parentClass = rel.parentClass;
                  const parentCol = rel.parentCol;

                  if (
                    isJoinTableValid(
                      schema.parameters[rel.parentTable]?.store,
                      schema.parameters[rel.childTable]?.store,
                    )
                  ) {
                    logger.info(`Join table valid for single relationship`);
                    addImport(imports, 'typeorm', ['ManyToOne', 'JoinColumn']);
                    addImport(
                      imports,
                      `../../../${kebabCase(parentClass)}/infrastructure/entities`,
                      `${parentClass}Entity`,
                    );

                    // lines.push(
                    //   `  @Column({ name: '${snakeCase(col.name)}', type: '${dataType(col.datatype)}', nullable: ${col.nn ? 'false' : 'true'} })`,
                    // );
                    // lines.push(`  ${camelCase(col.name)}: ${col.type};`);
                    // lines.push(``);
                    lines.push(
                      `  @ManyToOne(() => ${parentClass}Entity, (${camelCase(parentClass)}) => ${camelCase(parentClass)}.${camelCase(pluralize(rel.childTable))})`,
                    );
                    lines.push(`  @JoinColumn([`);
                    lines.push(
                      `    { name: '${snakeCase(col.name)}', referencedColumnName: '${camelCase(parentCol)}' },`,
                    );
                    lines.push(
                      `    { name: 'tenant_id', referencedColumnName: 'tenantId' },`,
                    );
                    lines.push(`  ])`);
                    lines.push(
                      `  ${camelCase(col.name)}${col.nn ? '' : '?'}: ${parentClass}Entity;`,
                    );
                    lines.push('');
                  } else {
                    logger.info(`Join table not valid for single relationship`);
                    lines.push(
                      `  @Column({ name: '${snakeCase(col.name)}', type: 'text', nullable: ${col.nn ? 'false' : 'true'} })`,
                    );
                    lines.push(
                      `  ${camelCase(col.name)}${col.nn ? '' : '?'}: string;`,
                    );
                    lines.push(``);
                  }
                } else {
                  logger.info(
                    `Parent table ${rel.parentTable} not in entity list, using standard column`,
                  );
                  switch (camelCase(col.name)) {
                    case 'createdAt':
                      addImport(imports, 'typeorm', 'CreateDateColumn');
                      lines.push(
                        `  @CreateDateColumn({ name: '${snakeCase(col.name)}', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })`,
                      );
                      break;
                    case 'updatedAt':
                      addImport(imports, 'typeorm', 'UpdateDateColumn');
                      lines.push(
                        `  @UpdateDateColumn({ name: '${snakeCase(col.name)}', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })`,
                      );
                      break;
                    default:
                      lines.push(
                        `  @Column({ ${enitityColumnList(table, col).join(', ')} })`,
                      );
                      break;
                  }
                  lines.push(
                    `  ${camelCase(col.name)}${col.nn ? '' : '?'}: ${col.type};`,
                  );
                  lines.push(``);
                }
              }
            } else {
              logger.info(
                `Column ${col.name} has no relationship, processing as standard column`,
              );

              const tsType = col.type;
              let length = col._properties?.length
                ? `, length: ${col._properties.length}`
                : '';

              if (col.autoinc) {
                logger.info(`Processing auto-increment column ${col.name}`);
                if (
                  col.pk &&
                  col.defaultvalue &&
                  col.defaultvalue.toLowerCase().includes('uuid()')
                ) {
                  addImport(imports, 'typeorm', 'PrimaryGeneratedColumn');
                  lines.push(
                    `  @PrimaryGeneratedColumn('uuid', { name: '${snakeCase(col.name)}' })`,
                  );
                  lines.push(`  ${camelCase(col.name)}: ${tsType};`);
                  lines.push(``);
                } else {
                  addImport(imports, 'typeorm', 'PrimaryGeneratedColumn');
                  lines.push(
                    `  @PrimaryGeneratedColumn({ name: '${snakeCase(col.name)}', type: '${dataType(col.datatype)}'${length} })`,
                  );
                  lines.push(`  ${camelCase(col.name)}: ${tsType};`);
                  lines.push(``);
                }
              } else if (col.pk) {
                logger.info(`Processing primary key column ${col.name}`);
                if (table._relationships.find((r) => r.childCol === col.name)) {
                  length = '';
                }
                if (col.defaultvalue === 'uuid()') {
                  addImport(imports, 'typeorm', 'PrimaryGeneratedColumn');
                  lines.push(
                    `  @PrimaryGeneratedColumn('uuid', { name: '${snakeCase(col.name)}' })`,
                  );
                } else {
                  imports['typeorm'].add('PrimaryColumn');
                  lines.push(
                    `  @PrimaryColumn({ name: '${snakeCase(col.name)}', type: '${dataType(col.datatype)}'${length} })`,
                  );
                }
                lines.push(`  ${camelCase(col.name)}: ${tsType};`);
                lines.push(``);
              } else {
                logger.info(`Processing regular column ${col.name}`);
                switch (camelCase(col.name)) {
                  case 'createdAt':
                    addImport(imports, 'typeorm', 'CreateDateColumn');
                    lines.push(
                      `  @CreateDateColumn({ name: '${snakeCase(col.name)}', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })`,
                    );
                    break;
                  case 'updatedAt':
                    addImport(imports, 'typeorm', 'UpdateDateColumn');
                    lines.push(
                      `  @UpdateDateColumn({ name: '${snakeCase(col.name)}', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })`,
                    );
                    break;
                  default:
                    lines.push(
                      `  @Column({ ${enitityColumnList(table, col).join(', ')} })`,
                    );
                    break;
                }
                if (col.datatype === 'JSON' && col.enum) {
                  lines.push(
                    `  ${camelCase(col.name)}${col.nn ? '' : '?'}: ${tsType}[];`,
                  );
                } else {
                  lines.push(
                    `  ${camelCase(col.name)}${col.nn ? '' : '?'}: ${tsType};`,
                  );
                }
                lines.push(``);
              }
            }

            logger.info(
              `Completed processing column ${colIndex + 1}: ${col.name}`,
            );
          } catch (colError) {
            logger.error(
              `Error processing column ${colIndex + 1} (${col.name}) for table ${table.name}:`,
              colError,
            );
            logger.error(`Column data:`, col);
          }
        });

      logger.info(`Completed column processing for table ${table.name}`);

      // ===== FINAL ENTITY GENERATION =====
      logger.info(`Building final entity for table ${table.name}`);

      // Build import statements
      const importTs = buildImportLines(imports);
      entityImports.push({
        entity: `${upperFirst(camelCase(table.name))}Entity`,
        path: `./${kebabCase(table.name)}/infrastructure/entities`,
      });

      // Final entity content
      const entityTs = `${importTs}

@Entity({ name: '${table.name}', schema: '${snakeCase(schema.service.module.toLowerCase())}' })
export class ${className}Entity {
${lines.join('\n')}
${relTs.join('\n')}
}
`;

      if (schema.excluded?.includes(`${fileBase}.entity.ts`)) {
        logger.info(
          `Skipping generation of ${fileBase}.entity.ts as it is excluded.`,
        );
        continue;
      }

      logger.info(`Writing entity file: ${filePath}`);
      console.log('Final file path:', filePath);
      await writeFileWithDir(filePath, entityTs);
      await createIndexFilesFromDirectory(
        path.join(outDir, kebabCase(className), 'infrastructure', 'entities'),
      );
      logger.info(`=== COMPLETED TABLE: ${table.name} ===`);
    } catch (tableError) {
      logger.error(`Error processing table ${table.name}:`, tableError);
      logger.error(`Table data:`, table);
      // Continue processing other tables
    }
  }

  // ===== MODULE GENERATION =====
  logger.info('Generating module files...');

  if (indexPaths.length) {
    const moduleLines = [];
    moduleLines.push(`import { Global, Module } from '@nestjs/common';`);
    moduleLines.push(`import { TypeOrmModule } from '@nestjs/typeorm';`);

    entityImports.forEach((table) => {
      moduleLines.push(`import { ${table.entity} } from '${table.path}';`);
    });

    moduleLines.push(``);
    moduleLines.push(`@Global()`);
    moduleLines.push(`@Module({`);
    moduleLines.push(
      `  imports: [TypeOrmModule.forFeature([${entityImports.map((i) => i.entity).join(', ')}])],`,
    );
    moduleLines.push(`  exports: [TypeOrmModule],`);
    moduleLines.push(`})`);
    moduleLines.push(`export class EntityModule {}`);
    moduleLines.push(``);

    await writeFileWithDir(
      path.join(outDir, `entities.module.ts`),
      moduleLines.join('\n') + '\n',
    );
  }

  logger.info('Entity generation completed successfully');
};

// Rest of the code remains the same...

const ormConfigModule = async (schema) => {
  const dirArray = schema.sourceDirectory.split(path.sep);
  dirArray.pop();

  const outDir = path.resolve(
    dirArray.join(path.sep),
    'infrastructure',
    'configuration',
    'typeorm',
  );

  copyDirectory(
    path.join(
      __dirname,
      '../',
      'files',
      'infrastructure',
      'configuration',
      'typeorm',
    ),
    outDir,
  );
};

function enitityColumnList(table, col) {
  const nullable = col.nn ? 'false' : 'true';
  let length = 0;
  let defaultValue = col.defaultvalue;
  let type = dataType(col.datatype);

  switch (type) {
    case 'longtext':
      type = 'varchar';
      break;
    case 'datetime':
      type = 'timestamp';
      break;
    case 'json':
      if (col.enum) {
        type = 'enum';
      }
  }
  if (col.param) {
    if (type === 'varchar') {
      length = col.param;
    }
  }
  // if (table._relationships.find((r) => r.childCol === col.name)) {
  //   length = 0;
  // }

  const opts = [`name: '${col.name.toLowerCase()}'`, `type: '${type}'`];

  if (length) opts.push(`length: ${length}`);
  if (defaultValue) {
    if (col.type === 'string') {
      opts.push(`default: '${defaultValue.replace(/'/g, "\\'")}'`);
    } else {
      opts.push(`default: ${defaultValue}`);
    }
  }
  opts.push(`nullable: ${nullable}`);
  const enumName = table._enums;
  if (enumName[col.name]) opts.push(`enum: ${enumName[col.name].name}`);
  if (col.datatype === 'JSON' && col.enum) {
    opts.push(`array: true,`);
  }
  return opts;
}
function dataType(datatype) {
  switch (datatype.toLowerCase()) {
    case 'double':
      return 'decimal';
    default:
      return datatype.toLowerCase();
  }
}

exports.create = create;
