#!/usr/bin/env bun

import { relative, join, resolve } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { Glob } from 'bun';

/**
 * A simple, dependency-free utility for creating elegant CLI output.
 * Uses ANSI escape codes for colors and formatting.
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
 * Helper function to wrap text with color codes.
 * @param {keyof typeof colors} color - The color name.
 * @param {string | number} text - The text to colorize.
 * @returns {string} The colorized text.
 */
const c = (color, text) => `${colors[color]}${text}${colors.reset}`;
const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Formats a line with a left-aligned and right-aligned part.
 * @param {string} left - The left-aligned string.
 * @param {string} right - The right-aligned string.
 * @returns {string} The formatted line.
 */
function formatRightAligned(left, right) {
  return `${left}  ${right}`;
}

/**
 * A collection of logging functions for formatted CLI output.
 */
const log = {
  reportTop: () => {
    console.log('');
  },
  reportBottom: () => {},
  reportSection: (message) => {
    console.log('');
    const title = c('bold', c('cyan', `${message}`));
    console.log(title);
  },
  cardLine: (label, value = '') => {
    const labelStr = `${label}`;
    const valueStr = String(value);
    const leftPart = `${labelStr}`;
    const rightPart = `${c('bold', valueStr)}`;
    console.log(formatRightAligned(leftPart, rightPart));
  },
  cardDivider: () => {},
  cardRaw: (line) => {
    console.log(line);
  },
  cardFile: (path, details = '') => {
    const leftPart = `  • ${path}`;
    const rightPart = c('dim', details);
    log.cardRaw(formatRightAligned(leftPart, rightPart));
  },
  cardItem: (message) => {
    const line = `    › ${message}`;
    log.cardRaw(c('dim', line));
  },
  cardDim: (message) => {
    const line = `  ${message}`;
    log.cardRaw(c('dim', line));
  },
  error: (message) => {
    const formatted = ` ${c('bold', c('red', '✖'))} ${c('red', message)} `;
    log.cardRaw(formatted);
  },
};

const INPUT_DIR_SOURCE = 'lib';

/**
 * @typedef {{
 * name: string;
 * path: string;
 * children?: FileTreeNode[];
 * }} FileTreeNode
 */

/**
 * Builds a file tree from the source for project structure display.
 */
async function buildProjectTree(dirPath) {
  try {
    const stats = await stat(dirPath);
    const name = dirPath.split('/').pop() || '';
    const node = { name, path: dirPath, children: [] };
    if (!stats.isDirectory()) {
      delete node.children;
      return node;
    }
    const dirents = await readdir(dirPath, { withFileTypes: true });
    for (const dirent of dirents) {
      const childPath = join(dirPath, dirent.name);
      const childNode = await buildProjectTree(childPath);
      if (childNode) node.children.push(childNode);
    }
    node.children.sort((a, b) => {
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
 * Recursively collects the data for each line of the tree for later printing.
 */
function collectTreeLines(node, prefix = '', isLast = true) {
  const result = [];
  const connector = isLast ? '└─' : '├─';
  const linePrefix = `${prefix}${connector} `;
  const name = node.children ? c('bold', node.name) : node.name;

  result.push({ prefix: linePrefix, name });

  if (node.children) {
    const newPrefix = prefix + (isLast ? '   ' : '│  ');
    for (const [index, child] of node.children.entries()) {
      result.push(
        ...collectTreeLines(
          child,
          newPrefix,
          index === node.children.length - 1,
        ),
      );
    }
  }
  return result;
}

/**
 * Recursively collects unstyled string lines for the file tree comment.
 */
function collectTreeStringLines(node, prefix = '', isLast = true) {
  const lines = [];
  const connector = isLast ? '└─' : '├─';
  const linePrefix = `${prefix}${connector} `;
  const name = node.name;

  lines.push(`${linePrefix}${name}`);

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
 * Generates and prints the project structure file tree to the console.
 */
function printProjectTree(tree) {
  if (!tree || !tree.children || tree.children.length === 0) {
    log.cardDim(`No files found to display in ./${INPUT_DIR_SOURCE}`);
    return;
  }
  log.cardRaw(c('bold', c('cyan', ` ./${tree.name}`)));
  const lines = [];
  for (const [index, child] of tree.children.entries()) {
    lines.push(
      ...collectTreeLines(child, '', index === tree.children.length - 1),
    );
  }

  for (const line of lines) {
    const { prefix, name } = line;
    log.cardRaw(`${prefix}${name}`);
  }
}

/** Main execution function for project structure analysis. */
async function analyzeProjectStructure() {
  const inputPath = resolve(process.cwd(), INPUT_DIR_SOURCE);
  const tree = await buildProjectTree(inputPath);
  printProjectTree(tree);
  return { tree };
}

/**
 * Parses the raw output from the TypeScript compiler.
 */
function parseTscOutput(output) {
  const errorsByFile = {};
  const errorRegex = /^(.*?)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.*)$/gm;
  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const [, filePath, line, column, message] = match;
    const relativePath = relative(process.cwd(), filePath);
    if (relativePath.startsWith('scripts/')) continue;
    if (!errorsByFile[relativePath]) errorsByFile[relativePath] = [];
    errorsByFile[relativePath].push(`L${line}:C${column} - ${message.trim()}`);
  }
  return errorsByFile;
}

function printTypeAnalysis(analysis) {
  const { errorsByFile, exitCode } = analysis;
  if (exitCode === 0) {
    log.cardLine('Status', c('green', 'OK'));
    log.cardLine('Total Errors', 0);
    return;
  }
  const totalErrors = Object.values(errorsByFile).flat().length;
  const totalFiles = Object.keys(errorsByFile).length;
  log.cardLine('Files with errors', totalFiles);
  log.cardLine('Total type errors', c('red', totalErrors));
  if (totalErrors > 0) {
    log.cardDim('Files with most errors:');
    const sortedFiles = Object.entries(errorsByFile).sort(
      ([, a], [, b]) => b.length - a.length,
    );
    for (const [file, errors] of sortedFiles) {
      const errorText = errors.length === 1 ? 'error' : 'errors';
      log.cardFile(
        c('bold', file),
        c('yellow', `(${errors.length} ${errorText})`),
      );
      errors.forEach((error) => log.cardItem(c('dim', error)));
    }
  }
}

/**
 * Executes the TypeScript compiler and returns a summary report.
 */
async function checkTypes() {
  const proc = Bun.spawn(['bun', 'tsc', '--noEmit', '--pretty', 'false'], {
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

  const errorsByFile = parseTscOutput(stdout);
  const totalErrors = Object.values(errorsByFile).flat().length;
  const totalFilesWithErrors = Object.keys(errorsByFile).length;

  return {
    status: exitCode === 0 ? 'OK' : 'Errors found',
    totalFilesWithErrors,
    totalErrors,
    errorsByFile,
    exitCode,
  };
}

/**
 * Runs the code formatter and returns a summary report.
 */
async function formatCode() {
  const proc = Bun.spawn(['bun', 'run', 'format'], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  const changedFiles = stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('Checked'));

  return {
    exitCode,
    changedFiles,
    output: stdout,
    errorOutput: stderr,
  };
}

/**
 * Prints the results of the code formatting analysis.
 * @param {object} analysis - The analysis result from formatCode.
 */
function printFormatAnalysis(analysis) {
  const { exitCode, changedFiles, errorOutput, output } = analysis;
  if (exitCode !== 0) {
    log.cardLine('Status', c('red', 'Error'));
    log.cardDim(errorOutput || output);
    return;
  }
  if (changedFiles.length > 0) {
    log.cardLine('Status', c('yellow', 'Formatted'));
    log.cardLine('Files changed', changedFiles.length);
    changedFiles.forEach((file) => log.cardFile(file.split(' ')[0]));
  } else {
    log.cardLine('Status', c('green', 'OK'));
    log.cardLine('Files changed', 0);
  }
}

/**
 * Runs the test suite and returns a summary report.
 */
async function runTests() {
  const proc = Bun.spawn(['bun', 'test'], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  const cleanOutput = stripAnsi(stdout);
  const lines = cleanOutput.trim().split('\n');

  let passed = 0;
  let failed = 0;

  // Try to find summary line like "2 pass, 0 fail"
  const summaryLine = lines.find(
    (l) =>
      l.includes('pass') &&
      (l.includes('fail') || l.includes('todo') || l.includes('skip')),
  );

  if (summaryLine) {
    const passesMatch = summaryLine.match(/(\d+)\s+pass/);
    const failsMatch = summaryLine.match(/(\d+)\s+fail/);
    passed = passesMatch ? parseInt(passesMatch[1], 10) : 0;
    failed = failsMatch ? parseInt(failsMatch[1], 10) : 0;
  } else {
    // Fallback for multi-line summary
    const lastLines = lines.slice(-5);
    const passLine = lastLines.find((l) => l.includes('pass'));
    const failLine = lastLines.find((l) => l.includes('fail'));
    if (passLine) passed = parseInt(passLine.trim().split(' ')[0], 10) || 0;
    if (failLine) failed = parseInt(failLine.trim().split(' ')[0], 10) || 0;
  }

  return {
    exitCode,
    passed,
    failed,
    output: stdout,
    errorOutput: stderr,
  };
}

/**
 * Prints the results of the test runner analysis.
 * @param {object} analysis - The analysis result from runTests.
 */
function printTestAnalysis(analysis) {
  const { exitCode, passed, failed, output } = analysis;
  if (exitCode === 0) {
    log.cardLine('Status', c('green', 'OK'));
    log.cardLine('Tests passed', c('green', passed));
    log.cardLine('Tests failed', 0);
  } else {
    log.cardLine('Status', c('red', 'Failed'));
    log.cardLine('Tests passed', c('green', passed));
    log.cardLine('Tests failed', c('red', failed));
    log.cardDim('Test output:');
    output.split('\n').forEach((line) => log.cardDim(`  ${line}`));
  }
}

const OUTPUT_FILE = 'webs.lock.txt';
const TEST_RESULTS_FILE = 'webs.test.txt';

/**
 * Gathers all source code from the input directory into a structured object.
 * @returns {Promise<object>} A map of relative file paths to their content.
 */
async function getInlineSource() {
  const inputPath = resolve(process.cwd(), INPUT_DIR_SOURCE);
  const glob = new Glob('**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}');
  const sourceData = {};
  const files = await Array.fromAsync(
    glob.scan({ cwd: inputPath, absolute: true, dot: true, onlyFiles: true }),
  );
  for (const filePath of files) {
    const relativePath = relative(inputPath, filePath);
    const file = Bun.file(filePath);
    if (file.size > 0) {
      sourceData[relativePath] = await file.text();
    }
  }
  return sourceData;
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
  const allLines = [header, ...lines];
  report += allLines.join('\n');
  report += '\n';
  return report;
}

/**
 * Generates a plain text report of the type analysis.
 * @param {object} analysis
 * @returns {string}
 */
function generateTypeAnalysisReport(analysis) {
  const { errorsByFile, exitCode, totalErrors, totalFilesWithErrors } =
    analysis;
  let report = 'Type Analysis:\n';
  if (exitCode === 0) {
    report += 'Status: OK\n';
    report += 'Total Errors: 0\n';
    return report;
  }

  report += `Status: ${totalErrors} error(s) found in ${totalFilesWithErrors} file(s)\n`;

  if (totalErrors > 0) {
    const sortedFiles = Object.entries(errorsByFile).sort(
      ([, a], [, b]) => b.length - a.length,
    );
    for (const [file, errors] of sortedFiles) {
      const errorText = errors.length === 1 ? 'error' : 'errors';
      report += `\nFile: ${file} (${errors.length} ${errorText})\n`;
      errors.forEach((error) => (report += `  - ${error}\n`));
    }
  }
  return report;
}

/**
 * Generates a plain text report of the code formatting analysis.
 * @param {object} analysis - The analysis result from formatCode.
 * @returns {string}
 */
function generateFormatReport(analysis) {
  let report = 'Code Formatting:\n';
  const { exitCode, changedFiles, errorOutput, output } = analysis;

  if (exitCode !== 0) {
    report += 'Status: Error\n';
    report += `\n--- ERROR OUTPUT ---\n${errorOutput || output}\n`;
    return report;
  }

  if (changedFiles.length > 0) {
    report += `Status: ${changedFiles.length} file(s) formatted\n`;
    changedFiles.forEach((file) => (report += `  - ${file.split(' ')[0]}\n`));
  } else {
    report += 'Status: OK\n';
    report += 'All files are correctly formatted.\n';
  }
  return report;
}

/**
 * Generates a plain text report of the test runner analysis.
 * @param {object} analysis - The analysis result from runTests.
 * @returns {string}
 */
function generateTestReport(analysis) {
  let report = 'Test Runner:\n';
  const { exitCode, passed, failed, output, errorOutput } = analysis;

  if (exitCode === 0) {
    report += 'Status: OK\n';
    report += `Summary: ${passed} test(s) passed.\n`;
  } else {
    report += `Status: ${failed > 0 ? `${failed} test(s) failed` : 'Error'}\n`;
    report += `Summary: ${passed} passed, ${failed} failed.\n`;
    report += `\n--- TEST OUTPUT ---\n${output}\n`;
    if (errorOutput) {
      report += `\n--- STDERR ---\n${errorOutput}\n`;
    }
  }
  return report;
}

/**
 * Saves the test report to a separate file.
 * @param {object} testAnalysis - The analysis result from runTests.
 */
async function saveTestReport(testAnalysis) {
  try {
    const reportContent = generateTestReport(testAnalysis);
    await Bun.write(TEST_RESULTS_FILE, reportContent);
  } catch (error) {
    log.error('An error occurred while saving the test report:');
    console.error(error);
  }
}

/**
 * Assembles the final lockfile from analysis reports.
 */
async function assembleLockfile(tree, source) {
  try {
    const now = new Date().toISOString();
    let fileContent = `// webs.lock.txt - Generated at ${now}\n\n`;

    fileContent += '// FRAMEWORK\n';

    fileContent += generateTreeReport(tree);

    fileContent += '// SOURCE\n';

    for (const [path, content] of Object.entries(source)) {
      fileContent += `// FILE: ${path}\n`;
      fileContent += `${content}\n\n`;
    }

    await Bun.write(OUTPUT_FILE, fileContent);
    log.cardLine('Output file', c('bold', `./${OUTPUT_FILE}`));
  } catch (error) {
    log.error('An error occurred during lockfile assembly:');
    console.error(error);
    process.exit(1);
  }
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', 'ⴀ', 'ⴄ', 'ⴈ', 'ⴌ', 'ⴐ'];

/**
 * Executes an async task with a spinner and a live timer.
 * @param {string} title - The message to display.
 * @param {() => Promise<T>} task - The async function to execute.
 * @returns {Promise<{result: T, duration: string}>} The result and duration of the task.
 * @template T
 */
async function runTaskWithSpinner(title, task) {
  let i = 0;
  let lastLineLength = 0;
  const startTime = performance.now();
  console.log('');

  const interval = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    const timer = c('dim', `(${elapsed}s)`);
    const line = `\r${c('magenta', spinnerFrames[i++ % spinnerFrames.length])} ${title} ${timer}`;
    process.stdout.write(line.padEnd(lastLineLength));
    lastLineLength = stripAnsi(line).length;
  }, 80);

  await new Promise((resolve) => setTimeout(resolve, 1));

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
 * Executes the main profiler flow, running build analysis sequentially.
 */
async function runProfiler() {
  log.reportTop();

  const { result: projectAnalysis } = await runTaskWithSpinner(
    'Analyzing Project Structure',
    analyzeProjectStructure,
  );

  const { result: formatAnalysis } = await runTaskWithSpinner(
    'Formatting Code',
    formatCode,
  );
  printFormatAnalysis(formatAnalysis);

  const { result: testAnalysis } = await runTaskWithSpinner(
    'Running Tests',
    runTests,
  );
  printTestAnalysis(testAnalysis);

  await runTaskWithSpinner('Saving Test Results', () =>
    saveTestReport(testAnalysis),
  );

  const { result: typeAnalysis } = await runTaskWithSpinner(
    'Checking for Type Errors',
    checkTypes,
  );
  printTypeAnalysis(typeAnalysis);

  const { result: source } = await runTaskWithSpinner(
    'Inlining Source Files',
    getInlineSource,
  );

  await runTaskWithSpinner('Generating Lockfile', () =>
    assembleLockfile(projectAnalysis.tree, source),
  );

  log.reportBottom();
}

await runProfiler();
