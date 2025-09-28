import { promises as fs } from 'fs';
import path from 'path';

const OUTPUT_FILE = 'webs.lock.txt';
const ROOT_DIRECTORY = '.';
const IGNORE_FILE = '.lockignore';

/**
 * Reads patterns from the .lockignore file.
 * @returns {Promise<string[]>} A promise that resolves to an array of ignore patterns.
 */
async function loadIgnorePatterns() {
  try {
    const ignoreContent = await fs.readFile(IGNORE_FILE, 'utf8');
    return ignoreContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    return [];
  }
}

/**
 * Converts a glob-style pattern to a RegExp object.
 * @param {string} pattern - The glob pattern (e.g., 'bin/*.dSYM/*').
 * @returns {RegExp} A regular expression for matching against paths.
 */
function globToRegex(pattern) {
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexString = escapedPattern.replace(/\*/g, '[^/]*');
  return new RegExp('^' + regexString + '$');
}

/**
 * Checks if a given file or directory should be ignored based on the patterns.
 * @param {string} currentPath - The full relative path of the file or directory.
 * @param {string[]} ignorePatterns - The array of ignore patterns.
 * @returns {boolean} True if the entry should be ignored, false otherwise.
 */
function isIgnored(currentPath, ignorePatterns) {
  const normalizedPath = currentPath.replace(/\\/g, '/');
  const entryName = path.basename(normalizedPath);

  return ignorePatterns.some((pattern) => {
    if (pattern.endsWith('/')) {
      return normalizedPath.startsWith(pattern.slice(0, -1));
    }

    if (pattern.startsWith('*.')) {
      return entryName.endsWith(pattern.substring(1));
    }

    const regex = globToRegex(pattern);
    return regex.test(normalizedPath);
  });
}

/**
 * Recursively scans a directory to find all file paths, respecting the ignore list.
 * @param {string} dirPath - The directory path to start scanning from.
 * @param {string[]} ignorePatterns - An array of patterns to ignore.
 * @param {string[]} allFiles - An array to accumulate file paths.
 * @returns {Promise<string[]>} A promise that resolves to an array of all file paths.
 */
async function getAllFiles(dirPath, ignorePatterns, allFiles = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (isIgnored(fullPath, ignorePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        await getAllFiles(fullPath, ignorePatterns, allFiles);
      } else {
        allFiles.push(fullPath);
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
  // Check for the '--include tests' command-line arguments
  const args = process.argv.slice(2);
  const includeTests =
    args.includes('--include') &&
    args[args.indexOf('--include') + 1] === 'tests';

  console.log('🔎 Starting to scan project files...');

  const ignorePatterns = await loadIgnorePatterns();
  const dynamicIgnores = [
    OUTPUT_FILE,
    path.basename(import.meta.path),
    IGNORE_FILE,
  ];

  if (!includeTests) {
    console.log(
      "Ignoring 'tests/' directory. Use '--include tests' to include it.",
    );
    dynamicIgnores.push('tests/');
  } else {
    console.log("Including files from 'tests/' directory.");
  }

  const allIgnorePatterns = [...ignorePatterns, ...dynamicIgnores];

  const filesToProcess = await getAllFiles(ROOT_DIRECTORY, allIgnorePatterns);

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
