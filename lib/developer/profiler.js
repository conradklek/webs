#!/usr/bin/env bun

import { relative, join, resolve, basename } from 'node:path';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { Glob } from 'bun';
import * as readline from 'node:readline';
import { AI } from '../ai/ai.server.js';
import {
  config as defaultConfig,
  aiConfig as defaultAiConfig,
} from '../server/server-config.js';
import { $ } from 'bun';

/**
 * @file Contains type definitions for the profiler and analysis tools.
 */

/**
 * Represents a node in the project's file structure tree.
 * @typedef {object} FileTreeNode
 * @property {string} name - The name of the file or directory.
 * @property {string} path - The absolute path to the file or directory.
 * @property {FileTreeNode[]} [children] - An array of child nodes if it's a directory.
 */

/**
 * The result object from running the test suite.
 * @typedef {object} TestAnalysis
 * @property {number} exitCode - The exit code of the test process.
 * @property {number} passed - The number of passed tests.
 * @property {number} failed - The number of failed tests.
 * @property {string} output - The standard output from the test runner.
 * @property {string} errorOutput - The standard error output from the test runner.
 */

/**
 * The result object from running the TypeScript compiler for type analysis.
 * @typedef {object} TypeAnalysis
 * @property {number} totalFilesWithErrors - The number of files containing type errors.
 * @property {number} totalErrors - The total number of type errors found.
 * @property {Record<string, string[]>} errorsByFile - An object mapping file paths to an array of error messages.
 * @property {number} exitCode - The exit code of the TypeScript compiler process.
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

/**
 * @param {keyof typeof colors} color
 * @param {string | number} text
 * @returns {string}
 */
const c = (color, text) => `${colors[color]}${text}${colors.reset}`;
/** @param {string} str */
const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

const log = {
  /** @param {string} label */
  cardLine: (label, value = '') => {
    console.log(`${label}  ${c('bold', String(value))}`);
  },
  /** @param {string} message */
  error: (message) => {
    const formatted = ` ${c('bold', c('red', '✖'))} ${c('red', message)} `;
    console.log(formatted);
  },
};

const EMBED_LOCK_FILE = '.webs-embed.lock.json';

/**
 * Builds a file tree from the source for project structure display.
 * @param {string} dirPath
 * @returns {Promise<FileTreeNode | null>}
 */
async function buildProjectTree(dirPath) {
  try {
    const stats = await stat(dirPath);
    const name = dirPath.split('/').pop() || '';
    /** @type {FileTreeNode} */
    const node = { name, path: dirPath, children: [] };
    if (!stats.isDirectory()) {
      delete node.children;
      return node;
    }
    const dirents = await readdir(dirPath, { withFileTypes: true });
    for (const dirent of dirents) {
      const childPath = join(dirPath, dirent.name);
      const childNode = await buildProjectTree(childPath);
      if (childNode) node.children?.push(childNode);
    }
    node.children?.sort((a, b) => {
      if (a.children && !b.children) return -1;
      if (!a.children && b.children) return 1;
      return a.name.localeCompare(b.name);
    });
    return node;
  } catch {
    return null;
  }
}

/**
 * @param {FileTreeNode} node
 * @param {string} [prefix]
 * @param {boolean} [isLast]
 * @returns {string[]}
 */
function collectTreeStringLines(node, prefix = '', isLast = true) {
  const lines = [];
  const connector = isLast ? '└─' : '├─';
  const linePrefix = `${prefix}${connector} `;
  lines.push(`${linePrefix}${node.name}`);
  if (node.children) {
    const newPrefix = prefix + (isLast ? '   ' : '│  ');
    for (const [index, child] of node.children.entries()) {
      lines.push(
        ...collectTreeStringLines(
          child,
          newPrefix,
          index === node.children.length - 1,
        ),
      );
    }
  }
  return lines;
}

/**
 * Generates a plain text report of the project structure.
 * @param {FileTreeNode | null} tree
 * @returns {string}
 */
function generateTreeReport(tree) {
  if (!tree || !tree.children || !tree.children.length) {
    return 'Project Structure: No files found.\n';
  }
  let report = 'Project Structure:\n';
  const header = ` ./${tree.name}`;
  const lines = [];
  for (const [index, child] of tree.children.entries()) {
    lines.push(
      ...collectTreeStringLines(child, '', index === tree.children.length - 1),
    );
  }
  report += [header, ...lines].join('\n');
  report += '\n';
  return report;
}

/**
 * @param {string} targetDir
 * @returns {Promise<TestAnalysis>}
 */
async function runTests(targetDir) {
  const proc = Bun.spawn(['bun', 'test', targetDir], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  const cleanOutput = stripAnsi(stdout);
  let passed = 0;
  let failed = 0;

  const passMatches = cleanOutput.match(/(\d+)\s+pass/g);
  const failMatches = cleanOutput.match(/(\d+)\s+fail/g);

  if (passMatches) {
    const lastPass = passMatches[passMatches.length - 1];
    const passCountStr = lastPass?.split(' ')[0];
    if (passCountStr) passed = parseInt(passCountStr, 10);
  }

  if (failMatches) {
    const lastFail = failMatches[failMatches.length - 1];
    const failCountStr = lastFail?.split(' ')[0];
    if (failCountStr) failed = parseInt(failCountStr, 10);
  }

  return { exitCode, passed, failed, output: stdout, errorOutput: stderr };
}

/**
 * @param {string} targetDir
 * @returns {Promise<TypeAnalysis>}
 */
async function checkTypes(targetDir) {
  const proc = Bun.spawn(['bun', 'tsc', '--noEmit', '--pretty', 'false'], {
    cwd: targetDir === 'lib' ? process.cwd() : targetDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (stderr && !stdout.trim()) {
    log.error('Error executing the TypeScript compiler:');
    console.error(stderr);
    process.exit(1);
  }

  /** @type {Record<string, string[]>} */
  const errorsByFile = {};
  const errorRegex = /^(.*?)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.*)$/gm;
  let match;
  while ((match = errorRegex.exec(stdout)) !== null) {
    const [, filePath, line, column, message] = match;
    if (filePath) {
      const relativePath = relative(process.cwd(), join(targetDir, filePath));
      if (!errorsByFile[relativePath]) errorsByFile[relativePath] = [];
      errorsByFile[relativePath]?.push(
        `L${line}:C${column} - ${(message || '').trim()}`,
      );
    }
  }

  const totalErrors = Object.values(errorsByFile).flat().length;
  const totalFilesWithErrors = Object.keys(errorsByFile).length;

  return { totalFilesWithErrors, totalErrors, errorsByFile, exitCode };
}

/**
 * @param {string} targetDir
 * @param {string[]} [additionalFiles]
 * @param {string[]} [excludedPatterns]
 * @returns {Promise<Record<string, string>>}
 */
async function getInlineSource(
  targetDir,
  additionalFiles = [],
  excludedPatterns = [],
) {
  const inputPath = resolve(process.cwd(), targetDir);
  const glob = new Glob('**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,webs}');
  /** @type {Record<string, string>} */
  const sourceData = {};

  const scannedFiles = await Array.fromAsync(
    glob.scan({ cwd: inputPath, absolute: true, dot: true, onlyFiles: true }),
  );

  const excludeGlobs = excludedPatterns.map((pattern) => {
    if (!pattern.includes('/') && !pattern.includes('\\')) {
      return new Glob(`**/${pattern}`);
    }
    return new Glob(pattern);
  });

  const filteredFiles = scannedFiles.filter((filePath) => {
    const relativePath = relative(inputPath, filePath);
    for (const glob of excludeGlobs) {
      if (glob.match(relativePath)) {
        return false;
      }
    }
    return true;
  });

  for (const filePath of filteredFiles) {
    const relativePath = relative(inputPath, filePath);
    const file = Bun.file(filePath);
    if (file.size > 0) {
      sourceData[relativePath] = await file.text();
    }
  }

  for (const filePath of additionalFiles) {
    const absolutePath = resolve(process.cwd(), filePath);
    try {
      const file = Bun.file(absolutePath);
      if ((await file.exists()) && file.size > 0) {
        const displayPath = relative(process.cwd(), absolutePath);
        sourceData[displayPath] = await file.text();
      } else {
        console.log(
          c('yellow', `  - Skipping: ${filePath} (not found or empty)`),
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error(`Error reading file ${filePath}: ${message}`);
    }
  }

  return sourceData;
}

/**
 * @param {string} targetDir
 * @returns {Promise<Record<string, { mtimeMs: number, size: number }>>}
 */
async function readLockfile(targetDir) {
  const lockfilePath = resolve(targetDir, EMBED_LOCK_FILE);
  try {
    const file = Bun.file(lockfilePath);
    if (await file.exists()) {
      return await file.json();
    }
    return {};
  } catch (error) {
    log.error('Error reading lockfile, proceeding without it.');
    console.error(error);
    return {};
  }
}

/**
 * @param {string} targetDir
 * @param {Record<string, { mtimeMs: number, size: number }>} fileStats
 */
async function writeLockfile(targetDir, fileStats) {
  const lockfilePath = resolve(targetDir, EMBED_LOCK_FILE);
  try {
    await Bun.write(lockfilePath, JSON.stringify(fileStats, null, 2));
  } catch (error) {
    log.error('Error writing lockfile.');
    console.error(error);
  }
}

/**
 * @param {TestAnalysis} analysis
 * @returns {string}
 */
function generateTestReport(analysis) {
  let report = 'Test Runner:\n';
  const { exitCode, passed, failed, output, errorOutput } = analysis;

  if (exitCode === 0 && failed === 0) {
    report += 'Status: OK\n';
  } else {
    report += `Status: ${failed > 0 ? 'Failed' : 'Error'}\n`;
  }
  report += `Summary: ${passed} test(s) passed, ${failed} test(s) failed.\n`;
  if (output) report += `\n--- TEST OUTPUT ---\n${output}\n`;
  if (errorOutput) {
    report += `\n--- STDERR ---\n${errorOutput}\n`;
  }
  return report;
}

/**
 * @param {TypeAnalysis} analysis
 * @returns {string}
 */
function generateTypeAnalysisReport(analysis) {
  const { exitCode, totalErrors, totalFilesWithErrors } = analysis;
  let report = 'Type Analysis:\n';
  if (exitCode === 0) {
    report += 'Status: OK\n';
    report += 'Total Errors: 0\n';
    return report;
  }

  report += `Status: ${totalErrors} error(s) found in ${totalFilesWithErrors} file(s)\n`;
  return report;
}

/**
 * @param {TypeAnalysis} analysis
 * @returns {string}
 */
function generateVerboseTypeAnalysisReport(analysis) {
  const { exitCode, totalErrors, totalFilesWithErrors, errorsByFile } =
    analysis;
  let report = 'Type Analysis:\n';
  if (exitCode === 0) {
    report += 'Status: OK\n';
    report += 'Total Errors: 0\n';
    return report;
  }

  report += `Status: ${totalErrors} error(s) found in ${totalFilesWithErrors} file(s)\n\n`;
  for (const [file, errors] of Object.entries(errorsByFile)) {
    report += `--- ${file} ---\n`;
    report += errors.join('\n') + '\n\n';
  }
  return report;
}

/**
 * @template T
 * @param {string} title
 * @param {() => Promise<T>} task
 * @returns {Promise<{result: T, duration: string}>}
 */
async function runTaskWithLoader(title, task) {
  let lastLineLength = 0;
  const startTime = performance.now();
  console.log('');

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;

  const interval = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    const timer = c('dim', `(${elapsed}s)`);
    const frame = spinnerFrames[frameIndex];
    if (frame) {
      const spinner = c('magenta', frame);
      const line = `\r ${spinner} ${title} ${timer}`;
      process.stdout.write(line.padEnd(lastLineLength));
      lastLineLength = stripAnsi(line).length;
    }
    frameIndex = (frameIndex + 1) % spinnerFrames.length;
  }, 80);

  try {
    const result = await task();
    clearInterval(interval);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    const timer = c('dim', `(${duration}s)`);
    const successLine = `\r${c('green', '✓')} ${title} ${timer}\n`;
    process.stdout.write(successLine.padEnd(lastLineLength + 1));
    return { result, duration };
  } catch (e) {
    clearInterval(interval);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    const timer = c('dim', `(${duration}s)`);
    const failLine = `\r${c('red', '✖')} ${title} ${timer}\n`;
    process.stdout.write(failLine.padEnd(lastLineLength + 1));
    throw e;
  }
}

/**
 * Generates a comprehensive lockfile with analysis and source code.
 * @param {string} targetDir
 * @param {string[]} [sectionsToInclude] - Optional array of sections to include: 'tree', 'types', 'tests', 'files'.
 * @param {string[]} [filesToInclude] - Optional array of additional files to include.
 * @param {string[]} [patternsToExclude]
 */
export async function createLockfile(
  targetDir,
  sectionsToInclude = [],
  filesToInclude = [],
  patternsToExclude = [],
) {
  const allSections = ['tree', 'types', 'tests', 'files'];
  const shouldIncludeAll =
    sectionsToInclude.length === 0 &&
    filesToInclude.length === 0 &&
    patternsToExclude.length === 0;

  let sections = shouldIncludeAll ? allSections : sectionsToInclude;

  if (filesToInclude.length > 0 && !sections.includes('files')) {
    sections.push('files');
  }

  const shouldRun = (/** @type {string} */ section) =>
    sections.includes(section);

  console.log(
    c('bold', `\nGenerating analysis lockfile for '${targetDir}'...`),
  );
  if (!shouldIncludeAll) {
    console.log(c('dim', `Including sections: ${sections.join(', ')}`));
    if (patternsToExclude.length > 0) {
      console.log(
        c('dim', `Excluding patterns: ${patternsToExclude.join(', ')}`),
      );
    }
  }

  const parts = [];

  if (shouldRun('tree')) {
    const { result: tree } = await runTaskWithLoader(
      'Building project tree',
      () => buildProjectTree(targetDir),
    );
    const treeReport = generateTreeReport(tree);
    let content = '========== PROJECT STRUCTURE ==========\n';
    content += stripAnsi(treeReport).replace('Project Structure:\n', '');
    parts.push(content);
  }

  if (shouldRun('types')) {
    const { result: typeAnalysis } = await runTaskWithLoader(
      'Checking Types',
      () => checkTypes(targetDir),
    );
    const typeReport = generateVerboseTypeAnalysisReport(typeAnalysis);
    let content = '========== TYPE ANALYSIS ==========\n';
    content += stripAnsi(typeReport).replace('Type Analysis:\n', '');
    parts.push(content);
  }

  if (shouldRun('tests')) {
    const { result: testAnalysis } = await runTaskWithLoader(
      'Running Tests',
      () => runTests(targetDir),
    );
    const testReport = generateTestReport(testAnalysis);
    let content = '========== TEST RUNNER ==========\n';
    content += stripAnsi(testReport).replace('Test Runner:\n', '');
    parts.push(content);
  }

  if (shouldRun('files')) {
    const { result: sourceFiles } = await runTaskWithLoader(
      'Collecting source files',
      () => getInlineSource(targetDir, filesToInclude, patternsToExclude),
    );
    let content = '========== SOURCE FILES ==========\n';
    for (const [path, sourceContent] of Object.entries(sourceFiles)) {
      content += `\n---------- START: ${path} ----------\n`;
      content += sourceContent;
      content += `\n---------- END: ${path} ----------\n`;
    }
    parts.push(content);
  }

  if (parts.length === 0) {
    console.log(
      c('yellow', 'No sections were included. Lockfile not created.'),
    );
    return;
  }

  const lockfileContent = parts.join('\n');
  const outputPath = resolve(targetDir, 'webs.lock.txt');
  await writeFile(outputPath, lockfileContent);

  console.log(
    c('green', `\n✓ Analysis complete. Lockfile saved to: ${outputPath}`),
  );
}

/**
 * @param {string} targetDir
 */
export async function startAiSession(targetDir) {
  const aiConfig = {
    ...defaultAiConfig,
    db: {
      ...defaultAiConfig.db,
      path: resolve(targetDir, '.webs/ai.db'),
    },
    worker: {
      path: resolve(defaultConfig.LIB_DIR, 'ai/ai.worker.js'),
    },
  };

  const ai = new AI(aiConfig);
  await ai.init();

  const source = await getInlineSource(targetDir);
  const tree = await buildProjectTree(targetDir);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c('cyan', 'webs> '),
  });

  console.log(
    c('bold', `\nWelcome to the Webs AI Profiler for '${targetDir}'.`),
  );
  console.log(c('dim', "Type 'help' for a list of commands.\n"));

  /** @type {{ [key: string]: (args: string[]) => void | Promise<void> }} */
  const commands = {
    help() {
      console.log('\nAvailable commands:');
      console.log(
        `  ${c('bold', 'tree')}          - Show the project structure tree.`,
      );
      console.log(
        `  ${c('bold', 'cat <file>')}    - Show the content of a source file.`,
      );
      console.log(
        `  ${c(
          'bold',
          'embed',
        )}          - Embed source files into the vector DB.`,
      );
      console.log(
        `  ${c('bold', 'query <terms>')}  - Query the embedded source files.`,
      );
      console.log(
        `  ${c(
          'bold',
          'chat <question>',
        )} - Chat with the AI about the codebase.`,
      );
      console.log(`  ${c('bold', 'exit | quit')}   - Exit the profiler.\n`);
    },
    exit() {
      rl.close();
    },
    quit() {
      rl.close();
    },
    tree() {
      console.log(generateTreeReport(tree));
    },
    /** @param {string[]} args */
    cat(args) {
      const filePath = args[0];
      if (!filePath) {
        log.error('Usage: cat <file_path>');
        return;
      }
      if (source[filePath]) {
        console.log(`\n--- Source for ${c('yellow', filePath)} ---\n`);
        console.log(source[filePath]);
        console.log(`\n--- End of Source ---\n`);
      } else {
        log.error(`File not found in source map: ${filePath}`);
      }
    },
    embed: async () => {
      const embedTask = async () => {
        const prevFileStats = await readLockfile(targetDir);
        /** @type {Record<string, { mtimeMs: number, size: number }>} */
        const currentFileStats = {};
        /** @type {{path: string, content: string}[]} */
        const filesToEmbed = [];

        for (const [path, content] of Object.entries(source)) {
          const absolutePath = resolve(targetDir, path);
          try {
            const fileStats = await stat(absolutePath);
            const currentMtime = fileStats.mtimeMs;
            const currentSize = fileStats.size;

            currentFileStats[path] = {
              mtimeMs: currentMtime,
              size: currentSize,
            };

            const prevStats = prevFileStats[path];
            if (
              !prevStats ||
              prevStats.mtimeMs !== currentMtime ||
              prevStats.size !== currentSize
            ) {
              filesToEmbed.push({ path, content });
            }
          } catch (e) {
            continue;
          }
        }

        if (filesToEmbed.length === 0) {
          console.log(
            c('green', '  All files are up-to-date. No embedding needed.'),
          );
          return { successCount: 0, failedCount: 0 };
        }

        let successCount = 0;
        let failedCount = 0;
        for (const file of filesToEmbed) {
          const success = await ai.indexFile(file, {});
          if (success) successCount++;
          else failedCount++;
        }
        await writeLockfile(targetDir, currentFileStats);
        return { successCount, failedCount };
      };

      try {
        const { result, duration } = await runTaskWithLoader(
          'Embedding source files',
          embedTask,
        );
        console.log(
          c(
            'green',
            `  Successfully embedded ${result.successCount} file(s) in ${duration}s.`,
          ),
        );
        if (result.failedCount > 0)
          console.log(c('yellow', `  Skipped ${result.failedCount} file(s).`));
      } catch (e) {
        log.error('An error occurred during embedding.');
      }
    },
    /** @param {string[]} args */
    query: async (args) => {
      const queryText = args.join(' ');
      if (!queryText) {
        log.error('Usage: query <search terms>');
        return;
      }
      const { result: results } = await runTaskWithLoader(
        `Searching for "${queryText}"`,
        () => ai.search(queryText, 5),
      );
      if (!results || results.length === 0) {
        console.log('  No results found.');
      } else {
        console.log(c('bold', `\n  Top ${results.length} results:`));
        results.forEach((res, i) => {
          console.log(
            `\n  ${i + 1}. ${c(
              'yellow',
              res.metadata.filePath,
            )} ${c('dim', `(score: ${res.score.toFixed(4)})`)}`,
          );
          console.log(c('dim', `    > ${res.text.split('\n')[0]}...`));
        });
        console.log('');
      }
    },
    /** @param {string[]} args */
    chat: async (args) => {
      const queryText = args.join(' ');
      if (!queryText) {
        log.error('Usage: chat <question>');
        return;
      }
      console.log(c('magenta', '\n...'));
      const stream = await ai.chat([{ role: 'user', content: queryText }]);
      const reader = stream.getReader();
      process.stdout.write(c('bold', 'AI: '));
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          process.stdout.write('\n\n');
          break;
        }
        process.stdout.write(value);
      }
    },
  };

  rl.on('line', async (line) => {
    const [command, ...args] = line.trim().split(/\s+/);
    const cmdFunc = command ? commands[command] : null;

    if (cmdFunc) {
      await cmdFunc(args);
    } else if (command) {
      log.error(
        `Unknown command: '${command}'. Type 'help' for available commands.`,
      );
    }
    rl.prompt();
  }).on('close', () => {
    ai.shutdown();
    console.log(c('bold', '\nExiting profiler.'));
    process.exit(0);
  });

  rl.prompt();
}

/**
 * @param {string} targetDir
 */
export async function runAnalysis(targetDir) {
  const { result: testAnalysis } = await runTaskWithLoader(
    'Running Tests',
    () => runTests(targetDir),
  );
  const { result: typeAnalysis } = await runTaskWithLoader(
    'Checking Types',
    () => checkTypes(targetDir),
  );

  console.log('\n--- Analysis Complete ---\n');
  console.log(c('bold', 'Type Analysis:'));
  console.log(
    generateTypeAnalysisReport(typeAnalysis).split('\n').slice(1).join('\n'),
  );
  console.log(c('bold', '\nTest Analysis:'));
  console.log(generateTestReport(testAnalysis).split('\n').slice(1).join('\n'));
}

/**
 * @param {object} inspectionData
 * @param {Record<string, import('../server/router.js').RouteDefinition>} inspectionData.appRoutes
 * @param {Record<string, import('../ai/ai.server.js').AgentDefinition>} inspectionData.agentRoutes
 * @param {string[]} inspectionData.sourceEntrypoints
 * @param {import('../server/server-config.js').Config} inspectionData.config
 * @param {Record<string, string>} inspectionData.sourceToComponentMap
 */
export async function generateInspectionReport({
  appRoutes,
  agentRoutes,
  sourceEntrypoints,
  config,
  sourceToComponentMap,
}) {
  console.log(
    c(
      'bold',
      `\nInspecting Webs project at '${relative(process.cwd(), config.CWD)}'`,
    ),
  );

  console.log(c('bold', '\nPages & API Routes'));
  console.log(c('dim', '──────────────────'));

  const sortedRoutes = Object.entries(appRoutes).sort(([pathA], [pathB]) =>
    pathA.localeCompare(pathB),
  );

  for (const [path, def] of sortedRoutes) {
    const methods = ['GET', ...Object.keys(def.handlers)].map((m) =>
      m.toUpperCase(),
    );
    if (Object.keys(def.wsHandlers).length > 0) {
      methods.push('WSS');
    }
    const methodStr = methods.map((m) => c('cyan', `[${m}]`)).join(' ');

    const componentName = def.componentName;
    const sourcePath = Object.entries(sourceToComponentMap).find(
      ([, name]) =>
        name === componentName ||
        `layout/${name.replace(/\//g, '_')}` === componentName,
    )?.[0];

    console.log(` ${methodStr} ${path}`);
    if (sourcePath) {
      console.log(c('dim', `        └─ component: ${sourcePath}`));
    }
  }

  console.log(c('bold', '\nRegistered Components'));
  console.log(c('dim', '───────────────────'));
  const guiComponents = [];
  const appComponents = [];

  for (const fullPath of sourceEntrypoints) {
    const relPath = relative(config.SRC_DIR, fullPath);
    if (relPath.endsWith('.agent.webs') || basename(relPath) === 'layout.webs')
      continue;

    if (relPath.startsWith('gui/')) {
      guiComponents.push({
        name: basename(relPath, '.webs'),
        path: `src/${relPath}`,
      });
    } else if (relPath.startsWith('app/')) {
      appComponents.push({
        name: relPath.replace('.webs', '').replace('app/', ''),
        path: `src/${relPath}`,
      });
    }
  }

  guiComponents.sort((a, b) => a.name.localeCompare(b.name));
  appComponents.sort((a, b) => a.name.localeCompare(b.name));

  for (const { name, path } of guiComponents) {
    console.log(` • ${name} ${c('dim', `(from: ${path})`)}`);
  }
  for (const { name, path } of appComponents) {
    console.log(` • ${name} ${c('dim', `(from: ${path})`)}`);
  }

  if (Object.keys(agentRoutes).length > 0) {
    console.log(c('bold', '\nAI Agents'));
    console.log(c('dim', '─────────'));
    for (const [name, def] of Object.entries(agentRoutes)) {
      console.log(` • ${name.replace('app/', '')}`);
      if (def.model) {
        console.log(c('dim', `   └─ model: ${def.model}`));
      }
      if (def.tools && def.tools.length > 0) {
        const toolNames = def.tools.map((t) => t.function.name).join(', ');
        console.log(c('dim', `   └─ tools: [${toolNames}]`));
      }
    }
  }
  console.log('');
}

/**
 * @param {string} pattern
 * @param {string} path
 * @param {string | undefined} filePattern
 */
export async function runGrep(pattern, path, filePattern) {
  const args = ['-r', '-n', '-I', '--color=always', pattern, path];
  if (filePattern) {
    args.splice(4, 0, `--include=${filePattern}`);
  }

  const proc = Bun.spawn(['grep', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();

  const highlight = (/** @type {string} */ line) => {
    return line.replace(
      new RegExp(pattern, 'g'),
      (/** @type {string} */ match) => c('red', c('bold', match)),
    );
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const [filePath, lineNum, ...rest] = line.split(':');
      const content = rest.join(':');
      if (filePath && lineNum) {
        process.stdout.write(
          `${c('yellow', filePath)}:${c('cyan', lineNum)}: ${highlight(
            content,
          )}\n`,
        );
      }
    }
  }

  const stderr = await new Response(proc.stderr).text();
  if (stderr) {
    console.error(c('red', `grep error:\n${stderr}`));
  }
}

/**
 * @param {number} port
 * @param {string} targetDir
 */
export async function startInteractiveShell(port, targetDir) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c('cyan', 'webs> '),
  });

  console.log(c('bold', `\nConnected to dev server on port ${port}.`));
  console.log(c('dim', "Type 'help' for a list of commands.\n"));

  /**
   * @param {string} output
   */
  const printResponse = (output) => {
    const [headerPart, ...bodyParts] = output.split('\r\n\r\n');
    const body = bodyParts.join('\r\n\r\n');
    const headers = headerPart?.split('\r\n') || [];
    const statusLine = headers.shift();

    if (statusLine) {
      const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+) (.*)/);
      if (statusMatch) {
        const code = parseInt(statusMatch[1] || '0', 10);
        const statusText = statusMatch[2];
        const color =
          code >= 200 && code < 300 ? 'green' : code >= 400 ? 'red' : 'yellow';
        console.log(c('bold', `Status: ${c(color, `${code} ${statusText}`)}`));
      }
    }

    console.log(c('bold', 'Headers:'));
    console.log(c('dim', headers.join('\n')));

    console.log(c('bold', '\nBody:'));
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  };

  /** @type {{ [key: string]: (args: string[]) => void | Promise<void> }} */
  const commands = {
    help() {
      console.log('\nAvailable commands:');
      console.log(
        `  ${c(
          'bold',
          'GET|POST|PUT|PATCH|DELETE <path> [body]',
        )} - Make an HTTP request.`,
      );
      console.log(
        `  ${c(
          'bold',
          'grep <pattern> [path] [--include <glob>]',
        )}   - Search for a pattern in files.`,
      );
      console.log(
        `  ${c(
          'bold',
          'test [path]',
        )}                               - Run tests for the project.`,
      );
      console.log(
        `  ${c('bold', 'exit | quit')}                                - Exit the shell.\n`,
      );
    },
    exit() {
      rl.close();
    },
    quit() {
      rl.close();
    },
    /** @param {string[]} args */
    async test(args) {
      const testPath = args[0] || targetDir;
      console.log(`Running tests for '${testPath}'...`);
      const { output, errorOutput } = await runTests(testPath);
      console.log(output);
      if (errorOutput) console.error(errorOutput);
    },
    /** @param {string[]} args */
    async grep(args) {
      const pattern = args[0];
      const path = args[1] || targetDir;
      const includeIndex = args.indexOf('--include');
      const filePattern =
        includeIndex !== -1 ? args[includeIndex + 1] : undefined;
      if (!pattern) {
        log.error('Usage: grep <pattern> [path] [--include <glob>]');
        return;
      }
      await runGrep(pattern, path, filePattern);
    },
  };

  /**
   * @param {string} method
   */
  const createRequestHandler =
    (method) => async (/** @type {string[]} */ args) => {
      const path = args[0];
      if (!path) {
        log.error(`Usage: ${method} <path> [body]`);
        return;
      }
      const body = args.slice(1).join(' ');
      const headers =
        method !== 'GET' ? `-H "Content-Type: application/json"` : '';
      const data = body ? `-d '${$.escape(body)}'` : '';
      const command = `curl -s -i -X ${method} http://localhost:${port}${path} ${headers} ${data}`;
      const { stdout, stderr, exitCode } = await $`${{
        raw: command,
      }}`.nothrow();

      if (exitCode !== 0) {
        log.error(`Request failed with exit code ${exitCode}`);
        console.error(stderr.toString());
      } else {
        printResponse(stdout.toString());
      }
    };

  commands.get = createRequestHandler('GET');
  commands.post = createRequestHandler('POST');
  commands.put = createRequestHandler('PUT');
  commands.patch = createRequestHandler('PATCH');
  commands.delete = createRequestHandler('DELETE');

  rl.on('line', async (line) => {
    const [command, ...args] = line.trim().split(/\s+/);
    const cmdFunc = command ? commands[command.toLowerCase()] : null;

    if (cmdFunc) {
      await cmdFunc(args);
    } else if (command) {
      log.error(`Unknown command: '${command}'. Type 'help' for commands.`);
    }
    rl.prompt();
  }).on('close', () => {
    console.log(c('bold', '\nExiting shell.'));
    process.exit(0);
  });

  rl.prompt();
}
