const path = require('path');
const { execSync } = require('child_process');

const create = async (schema) => {
  const schemaName = schema.service.module;
  const srcDir = path.resolve(__dirname, `../../../../src/${schemaName}`);

  execSync(
    `npx prettier --write "${srcDir}/**/*.{js,ts,jsx,tsx,json,css,scss,md,html}"`,
    { stdio: 'inherit' },
  );
};

const file = async (file) => {
  execSync(`npx prettier --write "${file}"`, { stdio: 'inherit' });
};

exports.create = create;
exports.file = file;
