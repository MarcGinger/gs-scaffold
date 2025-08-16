import fs from 'fs/promises';
import path from 'path';
// List of files to keep, relative to the project root

function kebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase to camel-Case
    .replace(/\s+/g, '-') // spaces to dashes
    .replace(/_+/g, '-') // underscores to dashes
    .toLowerCase();
}
const saveFiles = [];
let keptSet = new Set(saveFiles);
// Recursively process a directory
async function cleanDir(dir, root) {
  let entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // Compute path relative to project root, using forward slashes
    const rel = path.relative(root, fullPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      // Recurse
      await cleanDir(fullPath, root);
      // After cleaning, if directory is empty, remove it
      let after = await fs.readdir(fullPath);
      if (after.length === 0) {
        await fs.rmdir(fullPath);
      }
    } else if (entry.isFile()) {
      if (!keptSet.has(entry.name)) {
        await fs.unlink(fullPath);
      }
    }
  }
}

const create = async (schema) => {
  saveFiles.push(...(schema.excluded || []));
  Object.keys(schema.parameters).forEach((key) => {
    const item = schema.parameters[key];
    if (item.complete) {
      saveFiles.push(...item.complete);
    }
  });

  const dirArray = schema.sourceDirectory.split(path.sep);

  const moduleRoot = dirArray.pop();
  const outDir = path.resolve(dirArray.join(path.sep));

  const foldersToDelete = [moduleRoot];

  keptSet = new Set(saveFiles);
  for (const folder of foldersToDelete) {
    const projectRoot = path.resolve(outDir, folder);
    // Check if the directory exists before trying to clean it
    try {
      await fs.access(projectRoot);
    } catch (err) {
      continue;
    }
    await cleanDir(projectRoot, projectRoot);

    let after = await fs.readdir(projectRoot);
    if (after.length === 0) {
      await fs.rmdir(projectRoot);
    }
  }

  const eventStreamListFile = [
    path.resolve(outDir, 'event-stream', 'event-stream.service.ts'),
    path.resolve(outDir, 'eventstream-shared.module.ts'),
    path.resolve(
      outDir,
      'infrastructure',
      'configuration',
      'redis',
      'redis-config.module.ts',
    ),
    path.resolve(
      outDir,
      'infrastructure',
      'configuration',
      'typeorm',
      'typeorm-config.service.ts',
    ),
    path.resolve(
      outDir,
      'infrastructure',
      'configuration',
      'typeorm',
      '__tests__',
      'typeorm-config.service.spec.ts',
    ),
    path.resolve(outDir, 'infrastructure', 'index.ts'),
    path.resolve(outDir, 'infrastructure', 'configuration', 'index.ts'),
    path.resolve(outDir, 'shared.module.ts'),
    path.resolve(outDir, 'app.module.ts'),
    path.resolve(outDir, 'main.ts'),
  ];
  for (const file of eventStreamListFile) {
    // don't delete if in schema.excluded
    if (keptSet.has(path.basename(file))) {
      continue;
    }

    try {
      await fs.unlink(file);
    } catch (err) {}
  }
};

export { create };
