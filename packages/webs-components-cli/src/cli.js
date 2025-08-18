#!/usr/bin/env node

import { exit } from "process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const log = {
  info: (msg) => console.log(msg),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}!${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  dim: (msg) => console.log(`${colors.gray}${msg}${colors.reset}`),
};

function askQuestion(query, defaultValue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const queryString = `${colors.cyan}?${colors.reset} ${colors.bold}${query}${colors.reset} ${colors.gray}(${defaultValue})${colors.reset} `;

  return new Promise((resolve) =>
    rl.question(queryString, (ans) => {
      rl.close();
      resolve(ans.trim() || defaultValue);
    }),
  );
}

const getRegistryRoot = () => {
  const currentPath = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentPath, "../../../webs-components");
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    log.info(`
${colors.bold}Usage:${colors.reset} webs-components <command> [options]

${colors.bold}Commands:${colors.reset}
  add <component...>   Add one or more components to your project.
`);
    exit(0);
  }

  const [command, ...options] = args;

  switch (command) {
    case "add":
      await handleAddComponent(options);
      break;
    default:
      log.error(`Unknown command: ${command}`);
      break;
  }
}

async function handleAddComponent(componentsToAdd) {
  if (componentsToAdd.length === 0) {
    log.warn("Please specify which component(s) to add.");
    log.dim("Example: webs-components add button card");
    return;
  }

  log.info("Fetching component registry...");
  try {
    const registryRoot = getRegistryRoot();
    const registryPath = path.join(registryRoot, "registry.json");
    const registryFile = await fs.readFile(registryPath, "utf-8");
    const registry = JSON.parse(registryFile);
    log.success("Component registry loaded.");

    const installPath = await askQuestion(
      "Where should we install the components?",
      "src/components",
    );

    if (!installPath) {
      log.error("Component installation cancelled.");
      return;
    }

    const absoluteInstallPath = path.resolve(process.cwd(), installPath);
    await fs.mkdir(absoluteInstallPath, { recursive: true });

    for (const componentName of componentsToAdd) {
      const component = registry.components[componentName];
      if (!component) {
        log.warn(
          `Component '${componentName}' not found in registry. Skipping.`,
        );
        continue;
      }

      log.info(`Adding '${componentName}' component...`);

      try {
        const componentSourcePath = path.join(registryRoot, component.path);
        const componentCode = await fs.readFile(componentSourcePath, "utf-8");

        const targetDir = path.join(absoluteInstallPath, componentName);
        await fs.mkdir(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, path.basename(component.path));
        await fs.writeFile(targetPath, componentCode);

        log.success(`Successfully added '${componentName}' to ${targetPath}`);

        if (component.dependencies && component.dependencies.length > 0) {
          log.info(
            `  > Note: This component depends on: ${component.dependencies.join(", ")}`,
          );
        }
      } catch (error) {
        log.error(`Failed to add '${componentName}'.`);
        console.error(error);
      }
    }
  } catch (error) {
    log.error("Could not fetch component registry.");
    console.error(error);
  }
}

main().catch(console.error);
