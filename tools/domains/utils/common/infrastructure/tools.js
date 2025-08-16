const { isJoinTableValid } = require('../../utils/generator-utils');

const {
  upperFirst,
  camelCase,
  singularize,
  pluralize,
} = require('../../utils/word-utils');

/**
 * Extracts special columns that have relationships but are not JSON types
 * @param {Object} schema - The database schema containing tables and parameters
 * @param {Object} table - The table to analyze for special columns
 * @returns {Array} Array of special column objects with type, col, and rel properties
 */
function getSpecialColumns(schema, table) {
  // Safety check for relationships
  if (!table._relationships) {
    return [];
  }

  const specialCols = table.cols
    .filter((col) => col.datatype !== 'JSON')
    .map((col) => {
      const rel = table._relationships.find((r) => r.childCol === col.name);
      if (!rel) {
        return;
      }
      if (col.type === 'Record<string, any>') {
        return;
      }
      if (
        isJoinTableValid(
          schema.parameters[rel.parentTable]?.store,
          schema.parameters[rel.childTable]?.store,
        )
      ) {
        // Valid join table - return null to filter out
        return null;
      } else {
        return { type: 'special', col, rel };
      }
    })
    .filter((i) => i);

  return specialCols;
}

/**
 * Extracts complex object definitions for JSON columns with relationships
 * @param {Object} schema - The database schema containing tables and parameters
 * @param {Object} table - The table to analyze for complex objects
 * @returns {Array} Array of complex object definitions with metadata
 */
function getComplexObjects(schema, table) {
  // Safety check for relationships
  if (!table._relationships) {
    return [];
  }

  const complexObjects = [];

  table._relationships
    .map((rel) => {
      const column = Object.values(schema.tables)
        .find((t) => t.name === rel.childTable)
        ?.cols.find((c) => c.name === rel.childCol);
      return { ...rel, column };
    })
    .forEach((relation) => {
      const col = table.cols.find((c) => c.name === relation.childCol);
      if (!col) {
        return;
      }
      // if (col.datatype === 'JSON' && col.defaultvalue === 'object()') {
      //   return;
      // }
      if (col.datatype === 'JSON') {
        const tableRelation = Object.values(schema.tables).find(
          (t) => t.name === relation.parentTable,
        );
        if (tableRelation && tableRelation._relationships) {
          tableRelation._relationships.forEach((rel) => {
            const childCol = tableRelation.cols.find(
              (c) => c.name === rel.childCol && c.datatype !== 'JSON',
            );
            if (childCol) {
              // Handle complex object relationships
              if (
                !complexObjects.find((obj) => obj.key === camelCase(col.name))
              ) {
                if (relation.c_p === 'many' && relation.c_ch === 'many') {
                  complexObjects.push({
                    type: 'complex',
                    col,
                    rel: relation,
                    key: camelCase(col.name),
                    function: `get${upperFirst(camelCase(pluralize(relation.parentClass)))}`,
                    tableName: relation.parentTable,
                    tables: [],
                    isArray: true,
                    data: `${camelCase(col.name)}: Create${upperFirst(camelCase(relation.childTable))}Props['${camelCase(col.name)}']`,
                    model: `Create${upperFirst(camelCase(relation.parentClass))}Props`,
                    parentClass: relation.parentClass,
                  });
                } else {
                  complexObjects.push({
                    type: 'complex',
                    col,
                    rel: relation,
                    key: camelCase(col.name),
                    function: `get${upperFirst(camelCase(singularize(relation.parentClass)))}`,
                    tableName: relation.parentTable,
                    tables: [],
                    isArray: false,
                    data: `${camelCase(col.name)}: Create${upperFirst(camelCase(relation.childTable))}Props['${camelCase(col.name)}']`,
                    model: `Create${upperFirst(camelCase(relation.parentClass))}Props`,
                    parentClass: relation.parentClass,
                  });
                }
              }
            } else {
              if (col.defaultvalue === 'object()') {
                // Handle recordset relationships
                if (
                  !complexObjects.find((obj) => obj.key === camelCase(col.name))
                ) {
                  complexObjects.push({
                    type: 'recordset',
                    col,
                    rel: relation,
                    key: camelCase(col.name),
                    function: `get${upperFirst(camelCase(pluralize(relation.parentClass)))}`,
                    tableName: relation.parentTable,
                    tables: [],
                    isArray: true,
                    data: `${camelCase(col.name)}: Create${upperFirst(camelCase(relation.childTable))}Props['${camelCase(col.name)}']`,
                    model: `Create${upperFirst(camelCase(relation.parentClass))}Props`,
                    parentClass: relation.parentClass,
                  });
                }
              }
            }
          });
        }
      } else {
        // Handle simple relationships
        if (!complexObjects.find((obj) => obj.key === camelCase(col.name))) {
          if (relation.c_p === 'many' && relation.c_ch === 'many') {
            complexObjects.push({
              type: 'simple',
              col,
              rel: relation,
              key: camelCase(col.name),
              function: `get${upperFirst(camelCase(pluralize(relation.parentClass)))}`,
              tableName: relation.parentTable,
              tables: [],
              isArray: true,
              data: `${camelCase(pluralize(col.name))}: ${col.type}[]`,
              model: `Create${upperFirst(camelCase(relation.parentClass))}Props`,
              parentClass: relation.parentClass,
            });
          } else {
            complexObjects.push({
              type: 'simple',
              col,
              rel: relation,
              key: camelCase(col.name),
              function: `get${upperFirst(camelCase(singularize(relation.parentClass)))}`,
              tableName: relation.parentTable,
              tables: [],
              isArray: false,
              data: `${camelCase(col.name)}: ${col.type}`,
              model: `Create${upperFirst(camelCase(relation.parentClass))}Props`,
              parentClass: relation.parentClass,
            });
          }
        }
      }
    });

  complexObjects.forEach((complexObject) => {
    const complexTable = Object.values(schema.tables).find(
      (t) => t.name === complexObject.tableName,
    );

    if (!complexTable) {
      return;
    }
    const primary = complexTable.cols.find(
      (c) => c.pk && c.datatype === 'JSON',
    );

    if (primary && complexTable._relationships) {
      complexTable._relationships.forEach((rel) => {
        if (rel.childTable === complexTable.name) {
          complexObject.tables.push({
            table_name: rel.parentTable,
            childCol: complexTable.cols.find((c) => c.name === rel.childCol),
            parentCol: Object.values(schema.tables)
              .find((t) => t.name === rel.parentTable)
              ?.cols.find((c) => c.name === rel.parentCol),
            type: rel.c_p === 'many' && rel.c_ch === 'many' ? 'many' : 'one',
            primary: primary.name,
          });
        }
      });
    }
  });

  return complexObjects;
}

/**
 * Extracts relationship data for complex objects
 * @param {Object} schema - The database schema containing tables and parameters
 * @param {Object} table - The table to analyze for complex relationships
 * @returns {Array} Array of complex relationship objects
 */
function getComplexRelationships(schema, table) {
  const complexRelationships = [];
  getComplexObjects(schema, table).forEach((complexObject) => {
    const complexTable = Object.values(schema.tables).find(
      (t) => t.name === complexObject.tableName,
    );

    if (!complexTable) {
      return;
    }
    const primary = complexTable.cols.find(
      (c) => c.pk && c.datatype === 'JSON',
    );

    if (primary && complexTable._relationships) {
      complexTable._relationships.forEach((rel) => {
        const parentCol = table.cols.find((c) => c.name === rel.parentCol);
        if (rel.childTable === complexTable.name) {
          complexObject.tables.push({
            table_name: rel.parentTable,
            parentCol: parentCol,
            childCol: Object.values(schema.tables)
              .find((t) => t.name === rel.childTable)
              ?.cols.find((c) => c.name === rel.childCol),
            type: rel.c_p === 'many' && rel.c_ch === 'many' ? 'many' : 'one',
            primary: primary.name,
          });
          complexRelationships.push(rel);
        } else {
          const childCol = table.cols.find((c) => c.name === rel.childCol);
          if (childCol && childCol.defaultvalue === 'object()') {
            console.log(rel);
            complexObject.tables.push({
              table_name: rel.childTable,
              parentCol: childCol,
              childCol: parentCol,
              type: rel.c_p === 'many',
              primary: primary.name,
            });
            complexRelationships.push(rel);
          }
        }
      });
    }
  });
  return complexRelationships;
}

module.exports = {
  getComplexObjects,
  getComplexRelationships,
  getSpecialColumns,
};
