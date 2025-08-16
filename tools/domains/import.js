#!/usr/bin/env node

/**
 * extract-fields.js
 *
 * Reads schema.cleaned.json and extracts for each column:
 *  - name
 *  - type   (from datatype)
 *  - description (from comment)
 *
 * Outputs to fields.json
 *
 * Usage: node extract-fields.js
 */

const fs = require('fs-extra');
const path = require('path');

async function main() {
  const schemaName = process.argv[2];
  if (!schemaName) {
    console.error('❌ Error: Schema name is required');
    console.log('📖 Usage: node build.js <schema-name>');
    console.log('📝 Example: node build.js bank-product');
    process.exit(1);
  }

  // 1) Load the schema
  const schemaPath = path.resolve(__dirname, schemaName, 'schema.dmm');
  const schema = await fs.readJson(schemaPath);

  const fieldsPath = path.resolve(__dirname, 'fields.json');
  const fields = await fs.readJson(fieldsPath);
  for (const [tableId, table] of Object.entries(fields)) {
    if (['name', 'description'].includes(tableId)) {
      continue;
    }
    const schemaTable = schema.tables[tableId];
    if (!schemaTable) {
      console.warn(`Table ${tableId} not found in schema`);
      continue;
    }
    schemaTable.desc = table.description;
    for (const [colId, col] of Object.entries(table.cols)) {
      const schemaCol = schemaTable.cols.find((c) => c.name === colId);
      if (!schemaCol) {
        console.warn(
          `Column ${colId} not found in schema for table ${tableId}`,
        );
        continue;
      }
      schemaCol.comment = col.description;
      schemaCol.data = col.example || '';
      if (schemaCol.datatype.toUpperCase() === 'ENUM') {
        // Match the example to the correct case from the enum values
        if (schemaCol.enum) {
          const enumValue = schemaCol.enum.split(',')[0];
          schemaCol.data = enumValue;
        }
      }
    }
  }

  // 2) Walk all tables & columns

  // // 3) Write out fields.json
  await fs.writeJson(schemaPath, schema, { spaces: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
