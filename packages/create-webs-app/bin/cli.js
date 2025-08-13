#!/usr/bin/env bun

import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const color = (n, str) => `\x1b[${n}m${str}\x1b[0m`;

const projectName = process.argv[2];

if (!projectName) {
  console.error(color(31, 'Error: Please specify the project directory:'));
  console.log(`  ${color(36, 'create-webs-app')} ${color(33, '<project-directory>')}`);
  process.exit(1);
}

const projectRoot = process.cwd();
const projectDir = resolve(projectRoot, projectName);
const templateDir = resolve(fileURLToPath(import.meta.url), '../../template');

try {
  console.log(`\nCreating a new webs.js app in ${color(32, projectDir)}...`);
  await mkdir(projectDir, { recursive: true });
} catch (error) {
  console.error(color(31, `Error creating directory: ${error.message}`));
  process.exit(1);
}

try {
  const filesInProjectDir = await readdir(projectDir);
  if (filesInProjectDir.length > 0) {
    console.error(color(31, `Error: The directory "${projectName}" is not empty.`));
    process.exit(1);
  }

  console.log('Copying project files...');
  await cp(templateDir, projectDir, { recursive: true });
  console.log(color(32, '✔ Project files copied successfully!'));
} catch (error) {
  console.error(color(31, `Error copying files: ${error.message}`));
  process.exit(1);
}

console.log(`\n${color(32, 'Success!')} Created ${projectName} at ${projectDir}`);
console.log('\nInside that directory, you can run several commands:');

console.log(`\n  ${color(36, 'bun install')}`);
console.log('    Installs dependencies.');

console.log(`\n  ${color(36, 'bun run dev')}`);
console.log('    Starts the development server.');

console.log('\nWe suggest that you begin by typing:');
console.log(`\n  ${color(36, 'cd')} ${projectName}`);
console.log(`  ${color(36, 'bun install')}`);
console.log(`  ${color(36, 'bun run dev')}`);

