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

  const newSchema = {
    name: schema.model.name,
    description: schema.model.desc || '',
  };
  // 2) Walk all tables & columns
  for (const table of Object.values(schema.tables || {})) {
    newSchema[table.id] = {
      name: table.name,
      description: table.desc || '',
      cols: {},
    };
    for (const col of table.cols || []) {
      newSchema[table.id].cols[col.name] = {
        name: col.name,
        type: col.datatype,
        description: col.comment || '',
        example: col.data || '',
      };
    }
  }

  // 3) Write out fields.json
  const outPath = path.resolve(__dirname, 'fields.json');
  await fs.writeJson(outPath, newSchema, { spaces: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
