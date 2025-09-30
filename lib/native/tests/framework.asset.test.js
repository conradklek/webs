import {
  test,
  expect,
  describe,
  beforeAll,
  beforeEach,
  afterEach,
} from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_asset_walk, webs_free_string } = lib.symbols;

const TEST_INPUT_DIR = resolve(import.meta.dir, 'test-walker-project');

const setup = () => {
  rmSync(TEST_INPUT_DIR, { recursive: true, force: true });
  mkdirSync(TEST_INPUT_DIR, { recursive: true });
};

const cleanup = () => {
  rmSync(TEST_INPUT_DIR, { recursive: true, force: true });
};

function walkAsset(filePath) {
  const pathBuffer = Buffer.from(filePath + '\0');
  const resultPtr = webs_asset_walk(pathBuffer);

  if (!resultPtr || resultPtr.ptr === 0) {
    throw new Error('C function webs_asset_walk returned null pointer.');
  }

  try {
    const jsonString = new CString(resultPtr).toString();
    const result = JSON.parse(jsonString);
    if (result.error) {
      throw new Error(`${result.error}: ${result.message}`);
    }
    return result;
  } finally {
    webs_free_string(resultPtr);
  }
}

describe('Webs C Asset Walker', () => {
  beforeAll(() => {
    const make = Bun.spawnSync(['make']);
    if (make.exitCode !== 0) {
      throw new Error(`Compilation failed:\n${make.stderr.toString()}`);
    }
  });

  beforeEach(setup);
  afterEach(cleanup);

  test('should identify dependencies in a simple JS file', () => {
    const entryPath = resolve(TEST_INPUT_DIR, 'entry.js');
    writeFileSync(
      entryPath,
      `
        import { header } from './header.js';
        import footer from "./footer.js";
        const main = "hello";
        export { main };
        export default main;
      `,
    );

    const result = walkAsset(entryPath);

    expect(result.path).toBe(entryPath);
    expect(result.type).toBe(0);
    expect(result.dependencies).toEqual(['./header.js', './footer.js']);
    expect(result.exports.length).toBeGreaterThan(0);
  });

  test('should handle JS files with no dependencies', () => {
    const leafPath = resolve(TEST_INPUT_DIR, 'leaf.js');
    writeFileSync(
      leafPath,
      `
        export const message = 'I have no friends';
      `,
    );

    const result = walkAsset(leafPath);

    expect(result.path).toBe(leafPath);
    expect(result.dependencies).toEqual([]);
    expect(result.exports.length).toBeGreaterThan(0);
  });

  test('should return an error for a non-existent file', () => {
    const nonExistentPath = resolve(TEST_INPUT_DIR, 'ghost.js');
    expect(() => walkAsset(nonExistentPath)).toThrow();
  });

  test('should correctly identify asset type for CSS and HTML', () => {
    const cssPath = resolve(TEST_INPUT_DIR, 'styles.css');
    writeFileSync(cssPath, `body { color: red; }`);

    const htmlPath = resolve(TEST_INPUT_DIR, 'index.html');
    writeFileSync(htmlPath, `<h1>Hello</h1>`);

    const cssResult = walkAsset(cssPath);
    expect(cssResult.type).toBe(1);

    const htmlResult = walkAsset(htmlPath);
    expect(htmlResult.type).toBe(2);
  });
});
