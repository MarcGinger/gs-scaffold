const fs = require('fs-extra');

const path = require('path');
const { writeFileWithDir, deleteFileWithDir } = require('../utils/file-utils');
const {
  buildImportLines,
  shouldSkipTable,
} = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  pluralize,
  sentenceCase,
} = require('../utils/word-utils');
const { logger, defaultConfig } = require('../utils/general-utils');

const create = async (moduleName) => {
  const sourceDirectory = path.resolve(
    __dirname,
    '../',
    '../',
    '../',
    '..',
    'src',
  );

  let schema = await fs.readJson(
    path.resolve(__dirname, '../', '../', moduleName, 'schema.dmm'),
  );

  await buildProperties(schema, moduleName);

  Promise.all([
    properties(schema),
    getRelationships(schema),
    mapEnums(schema),
    columnProperties(schema),
  ]);

  schema.sourceDirectory =
    sourceDirectory + path.sep + `${schema.service.module}`;

  await writeFileWithDir(
    path.resolve(__dirname, '../', '../', moduleName, 'schema.json'),
    JSON.stringify(schema, null, 2),
  );
  return schema;
};

async function buildProperties(schema, moduleName) {
  //get the directory name from __dirname, '..', '..'
  const dirName = path
    .dirname(path.resolve(__dirname, '..', '..'))
    .split(path.sep)
    .pop();

  try {
    parameters = await fs.readJson(
      path.resolve(__dirname, '../', '../', moduleName, 'parameters.json'),
    );
  } catch (err) {
    // If file does not exist or is invalid, parameters remains {}
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  // Ensure 'service' and 'tables' attributes exist on parameters, else add them
  if (!parameters.hasOwnProperty('service')) {
    parameters.service = { name: dirName, version: '1' };
  }

  parameters.service.module = moduleName;

  if (!parameters.hasOwnProperty('tables')) {
    parameters.tables = {};
  }
  if (!parameters.hasOwnProperty('excluded')) {
    parameters.excluded = [];
  }
  if (!parameters.hasOwnProperty('docs')) {
    parameters.docs = {};
  }

  if (!parameters.docs.hasOwnProperty('summary')) {
    parameters.docs.summary = `This is the ${sentenceCase(moduleName)} service`;
  }

  const tables = schema.tables;

  Object.values(tables).forEach((table) => {
    if (!parameters.tables.hasOwnProperty(table.name)) {
      parameters.tables[table.name] = {};
    }
    const tableParams = parameters.tables[table.name];

    if (!tableParams.hasOwnProperty('docs')) {
      tableParams.docs = {};
    }

    if (!tableParams.docs.hasOwnProperty('summary')) {
      tableParams.docs.summary = `This is the ${sentenceCase(table.name)} module`;
    }

    if (!tableParams.hasOwnProperty('permissions')) {
      tableParams.permissions = {
        enabled: true,
        prefix: ``,
      };
    }
    if (!tableParams.hasOwnProperty('apis')) {
      tableParams.apis = {};
    }

    if (!tableParams.hasOwnProperty('store')) {
      tableParams.store = {
        read: 'sql,eventstream,redis',
        write: 'sql,eventstream,redis',
      };
    }
    if (!tableParams.store.hasOwnProperty('list')) {
      tableParams.store.list = 'sql,eventstream,redis';
    }

    if (!tableParams.hasOwnProperty('cancel')) {
      tableParams.cancel = {
        create: false,
        update: false,
        delete: false,
        batch: false,
        get: false,
      };
    }
    if (!tableParams.hasOwnProperty('complete')) {
      tableParams.complete = [];
    }
    if (!tableParams.hasOwnProperty('redis')) {
      tableParams.redis = {
        category: `lookups:core.${kebabCase(table.name.toLowerCase())}.v1`,
        ttl: 3600,
        hash: true,
      };
    }
    if (!tableParams.redis.hasOwnProperty('prefix')) {
      tableParams.redis.prefix = moduleName;
    }
    if (!tableParams.redis.hasOwnProperty('aggregate')) {
      tableParams.redis.aggregate = `${kebabCase(table.name.toLowerCase())}`;
    }

    if (!tableParams.redis.hasOwnProperty('version')) {
      tableParams.redis.version = 'v1';
    }

    if (!tableParams.hasOwnProperty('eventstream')) {
      tableParams.eventstream = {
        stream: `core.${kebabCase(table.name)}.v1`,
        'create-type': 'create.v1',
        'update-type': 'update.v1',
      };
    }

    if (!tableParams.eventstream.hasOwnProperty('boundedContext')) {
      tableParams.eventstream.boundedContext = moduleName;
    }
    if (!tableParams.eventstream.hasOwnProperty('prefix')) {
      tableParams.eventstream.aggregate = `${kebabCase(table.name.toLowerCase())}`;
    }

    if (!tableParams.eventstream.hasOwnProperty('version')) {
      tableParams.eventstream.version = 'v1';
    }

    if (!tableParams.hasOwnProperty('cols')) {
      tableParams.cols = {};
    }
    // Remove parameters.cols that do not exist in table.cols
    Object.keys(tableParams.cols).forEach((colName) => {
      if (!table.cols.some((col) => col.name === colName)) {
        delete tableParams.cols[colName];
      }
    });

    // Ensure every col in table.cols has an entry in parameters.cols
    table.cols.forEach((col) => {
      if (!tableParams.cols.hasOwnProperty(col.name)) {
        tableParams.cols[col.name] = {};
      }
    });

    // delete all unrelated tables from parameters.tables
    Object.keys(parameters.tables).forEach((tableName) => {
      if (!Object.values(tables).find((t) => t.name === tableName)) {
        delete parameters.tables[tableName];
      }
    });
  });

  let hasRedis = false;
  let hasSql = false;
  let hasEventStream = false;

  Object.values(schema.tables).forEach((table) => {
    if (table.cols.find((c) => c.pk && c.datatype === 'JSON')) {
    } else {
      if (
        parameters.tables[table.name].store.read === 'redis' ||
        parameters.tables[table.name].store.write === 'redis' ||
        parameters.tables[table.name].store.list === 'redis'
      ) {
        hasRedis = true;
      }
      if (
        parameters.tables[table.name].store.read === 'sql' ||
        parameters.tables[table.name].store.write === 'sql' ||
        parameters.tables[table.name].store.list === 'sql'
      ) {
        hasSql = true;
      }
      if (
        parameters.tables[table.name].store.read === 'eventstream' ||
        parameters.tables[table.name].store.write === 'eventstream'
      ) {
        hasEventStream = true;
      }
    }
  });

  parameters.service.hasRedis = hasRedis;
  parameters.service.hasSql = hasSql;
  parameters.service.hasEventStream = hasEventStream;

  await deleteFileWithDir(
    path.resolve(__dirname, '../', '../', moduleName, 'parameters.json'),
  );
  await writeFileWithDir(
    path.resolve(__dirname, '../', '../', moduleName, 'parameters.json'),
    JSON.stringify(parameters, null, 2),
  );

  logger.success(
    `Parameters file updated at ${path.resolve(__dirname, '../', moduleName, 'parameters.json')}`,
  );

  schema.parameters = parameters.tables;
  schema.service = parameters.service;
  schema.excluded = parameters.excluded || [];
}

function getRelationships(schema) {
  const relations = Object.values(schema.relations || {});
  Object.values(schema.tables).forEach((table) => {
    const relationships = Object.values(schema.relations)
      .map((rel) => {
        const isParent = rel.parent === table.id;
        const isChild = rel.child === table.id;
        if (!isParent && !isChild) return;

        const parentTbl = schema.tables[rel.parent];
        const childTbl = schema.tables[rel.child];
        const parentClass = upperFirst(camelCase(parentTbl.name));
        const childClass = upperFirst(camelCase(childTbl.name));
        const mapping = rel.cols[0];
        const parentCol = parentTbl.cols.find(
          (c) => c.id === mapping.parentcol,
        ).name;

        const childCol = childTbl.cols.find(
          (c) => c.id === mapping.childcol,
        ).name;

        return {
          name: rel.name,
          isChild,
          isParent,
          parentTable: parentTbl.name,
          parent: parentTbl.name,
          parentCol,
          parentClass,
          childTable: childTbl.name,
          child: childTbl.name,
          childCol,
          childClass,
          c_p: rel.c_p,
          c_ch: rel.c_ch,
        };
      })
      .filter(Boolean);
    table._relationships = relationships;

    relationships.forEach((rel) => {
      const parentCol = Object.values(schema.tables)
        .find((t) => t.name === rel.parentTable)
        .cols.find((c) => c.name === rel.parentCol);
      if (!parentCol) {
        logger.error(
          `Relationship ${rel.name} has parent column ${rel.parentCol} not found in table ${rel.parentTable}`,
        );
        return;
      }
      if (parentCol.defaultvalue === 'uuid()') {
        const childCol = Object.values(schema.tables)
          .find((t) => t.name === rel.childTable)
          .cols.find((c) => c.name === rel.childCol);

        childCol.param = '36';
      }
    });
  });
  return schema;
}

function mapEnums(schema) {
  const tables = schema.tables;
  Object.values(tables).forEach((table) => {
    const className = upperFirst(camelCase(table.name));
    // 1. Enum detection and declarations
    const enumCols = table.cols.filter((c) => c.enum && c.enum.includes(','));
    const enumNameMap = {};
    let enumDeclarations = '';
    if (enumCols.length) {
      enumCols.forEach((col) => {
        const enumType = `${className}${upperFirst(camelCase(col.name))}Enum`;
        enumNameMap[col.name] = { file: camelCase(table.name), name: enumType };
        const values = col.enum.split(',').map((v) => v.trim());
        enumDeclarations += `export enum ${enumType} {
`;
        values.forEach((val) => {
          const key = val.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
          enumDeclarations += `  ${key} = '${val}',
`;
        });
        enumDeclarations += `}

`;
        enumNameMap[col.name]['declaration'] = enumDeclarations;
      });
    }
    table._enums = enumNameMap;
  });
  return schema;
}

function columnProperties(schema) {
  const tables = schema.tables;
  Object.values(tables).forEach((table) => {
    table.cols.forEach((col) => {
      if (col.defaultvalue === 'uuid()') {
        col.datatype = 'VARCHAR';
      }

      switch (col.datatype.toUpperCase()) {
        case 'ENUM':
          col.type = `${upperFirst(camelCase(table.name))}${upperFirst(camelCase(col.name))}Enum`;
          break;
        case 'VARCHAR':
        case 'TEXT':
        case 'CHAR':
        case 'LONGTEXT':
          col.type = 'string';
          break;
        case 'INT':
          col.type = 'number';
          break;
        case 'DECIMAL':
          col.type = 'number';
          break;
        case 'BIGINT':
          col.type = 'number';
          break;
        case 'FLOAT':
        case 'REAL':
          col.type = 'number';
          break;
        case 'DOUBLE':
          col.type = 'number';
          break;
        case 'DATE':
          col.type = 'Date';
          break;

        case 'DATETIME':
        case 'TIMESTAMP':
          col.type = 'Date';
          break;
        case 'BOOLEAN':
          col.type = 'boolean';
          break;
        case 'JSON':
        case 'JSONB':
          const rel = table._relationships.find((r) => r.childCol === col.name);
          if (rel) {
            col.type = rel.parentClass;
          } else {
            col.type = 'Record<string, any>';
          }
          break;
        default:
          col.type = 'any';
      }
    });
  });
  return schema;
}

function properties(schema) {
  const tables = schema.tables;
  Object.values(tables).forEach((table) => {
    let plural = table.name;
    plural =
      ['person'].indexOf(plural) === -1
        ? camelCase(pluralize(table.name))
        : camelCase(table.name + 's');
    table._properties = {
      plural,
    };
  });
  return schema;
}

exports.create = create;
