import path from 'path';
import { promises as fs } from 'fs';
// import a text file from the root directory
import { fileURLToPath } from 'url';

import execSync from 'child_process';

export async function readFileWithDir(filePath, encoding = 'utf8') {
  try {
    // Check if the file exists
    await fs.access(filePath);
    // Read the file content
    const data = await fs.readFile(filePath, encoding);
    // Return the file content
    return data;
  } catch (error) {
    // If the file does not exist, return an empty string
    if (error.code === 'ENOENT') {
      return '';
    }
    // For other errors, rethrow
    throw error;
  }
}

export async function writeFileWithDir(filePath, data, force = false) {
  const dir = path.dirname(filePath);
  // read the license header from the file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const license = await readFileWithDir(
    path.join(__dirname, '../', '../', 'license.txt'),
    'utf8',
  );

  // Don't write the file if it already exists
  try {
    if (!force) {
      await fs.access(filePath);
      // If the file exists, skip writing
      return;
    } else {
      throw new Error(`File ${filePath} already exists, but force is true.`);
    }
  } catch {
    // If the file does not exist, proceed to write

    await fs.mkdir(dir, { recursive: true }); // Ensure directory exists
    if (filePath.endsWith('.ts')) {
      // Add TypeScript specific license header

      await fs.writeFile(filePath, license + data, 'utf8');
    } else {
      // For non-TypeScript files, write data without the license header
      await fs.writeFile(filePath, data, 'utf8');
    }
  }
}

export async function deleteFileWithDir(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // If the file does not exist, it's not an error
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export async function createIndexFilesFromDirectory(
  outputDirectory,
  exclude = [],
) {
  try {
    // Read all files and directories in the output directory
    // Check if the directory exists
    try {
      await fs.access(outputDirectory);
    } catch {
      // Directory does not exist, exit early
      return;
    }
    const entries = await fs.readdir(outputDirectory, { withFileTypes: true });

    // Separate directories and TypeScript files
    const directories = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== '__tests__' &&
          !exclude.includes(entry.name),
      )
      .map((dir) => dir.name);
    const tsFiles = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts') &&
          !exclude.includes(entry.name) &&
          entry.name !== 'index.ts',
      )
      .map((file) => file.name);

    if (tsFiles.length === 0 && directories.length === 0) {
      return;
    }

    // Process subdirectories recursively
    for (const dir of directories) {
      const subDirPath = path.join(outputDirectory, dir);
      await createIndexFilesFromDirectory(subDirPath);
    }

    // Create export statements for files
    const fileExports = tsFiles.map(
      (file) => `export * from './${file.replace(/\.ts$/, '')}';`,
    );

    // Create export statements for directories
    const directoryExports = directories.map(
      (dir) => `export * from './${dir}';`,
    );

    // Combine and sort all exports
    const allExports = [...fileExports, ...directoryExports].sort();

    // Write the index.ts file
    await writeFileWithDir(
      path.join(outputDirectory, 'index.ts'),
      allExports.join('\n') + '\n',
    );
  } catch (error) {
    throw error;
  }
}

export async function copyDirectory(source, destination, exclude = []) {
  try {
    // read the license header from the file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const license = await readFileWithDir(
      path.join(__dirname, '../', '../', 'license.txt'),
      'utf8',
    );

    // Read all entries in the source directory
    const entries = await fs.readdir(source, { withFileTypes: true });

    // Copy each entry to the destination directory
    await Promise.all(
      entries.map(async (entry) => {
        const srcPath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);
        if (entry.isDirectory()) {
          // Recursively copy subdirectories
          await copyDirectory(srcPath, destPath, exclude);
        } else {
          // Skip excluded filess
          if (exclude.includes(entry.name)) {
            return;
          }
          await fs.mkdir(destination, { recursive: true });
          //If file exists in destination, skip copying
          try {
            await fs.access(destPath);
            return; // File already exists, skip copying
          } catch {
            // Copy files
            // add license header to TypeScript files
            if (
              entry.name.endsWith('.ts') &&
              !entry.name.endsWith('.spec.ts') &&
              entry.name !== 'index.ts'
            ) {
              const data = await fs
                .readFile(srcPath, 'utf8')
                .then((content) => license + content);

              await fs.writeFile(destPath, data, 'utf8');
            } else {
              await fs.copyFile(srcPath, destPath);
            }
          }
        }
      }),
    );
  } catch (error) {}
}

export async function deleteDirectory(directory) {
  try {
    // Check if the directory exists
    await fs.access(directory);
    // Remove the directory and all its contents
    await fs.rm(directory, { recursive: true, force: true });
  } catch (error) {}
}

export async function directoryExists(directory) {
  try {
    await fs.access(directory);
    return true;
  } catch (error) {
    return false;
  }
}

//delete empty directories recursively
export async function deleteEmptyDirectories(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Recursively delete empty directories
        await deleteEmptyDirectories(fullPath);
        // Check if the directory is empty after recursion
        const remainingEntries = await fs.readdir(fullPath);
        if (remainingEntries.length === 0) {
          await fs.rmdir(fullPath);
        }
      }
    }
  } catch (error) {
    throw error;
  }
}
