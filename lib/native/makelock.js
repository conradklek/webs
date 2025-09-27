import { promises as fs } from 'fs';
import path from 'path';

const OUTPUT_FILE = 'webs.lock.txt';
const ROOT_DIRECTORY = '.';

const IGNORED_PATHS = [
  '.git',
  'node_modules',
  '.DS_Store',
  'package-lock.json',
  'bun.lockb',
  OUTPUT_FILE,
];

const IGNORED_EXTENSIONS = ['.d', '.o', '.dylib', '.so', '.dll'];

/**
 * Recursively scans a directory to find all file paths, respecting the ignore lists.
 * @param {string} dirPath - The directory path to start scanning from.
 * @param {string[]} allFiles - An array to accumulate file paths.
 * @returns {Promise<string[]>} A promise that resolves to an array of all file paths.
 */
async function getAllFiles(dirPath, allFiles = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      const isIgnoredPath = IGNORED_PATHS.includes(entry.name);
      const isIgnoredExtension = IGNORED_EXTENSIONS.some((ext) =>
        entry.name.endsWith(ext),
      );

      if (isIgnoredPath || isIgnoredExtension) {
        continue;
      }

      if (entry.isDirectory()) {
        await getAllFiles(fullPath, allFiles);
      } else {
        if (entry.name !== path.basename(import.meta.path)) {
          allFiles.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  return allFiles;
}

/**
 * Main function to create the lock file.
 */
async function createLockFile() {
  console.log('🔎 Starting to scan project files...');

  const filesToProcess = await getAllFiles(ROOT_DIRECTORY);

  if (filesToProcess.length === 0) {
    console.log('No files found to process. Exiting.');
    return;
  }

  console.log(`Found ${filesToProcess.length} files to include.`);

  const contentParts = [];

  for (const filePath of filesToProcess) {
    try {
      console.log(`  -> Inlining ${filePath}`);
      const fileContent = await fs.readFile(filePath, 'utf8');

      contentParts.push(`/* START: ${filePath} */\n`);
      contentParts.push(fileContent);
      contentParts.push(`/* END: ${filePath} */`);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      contentParts.push(`/* ERROR: Could not read file ${filePath} */`);
    }
  }

  try {
    await fs.writeFile(OUTPUT_FILE, contentParts.join('\n\n'));
    console.log(`\nSuccess! All files have been combined into ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`\nFailed to write the final lock file:`, error);
  }
}

createLockFile();
