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
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_bundle, webs_free_string } = lib.symbols;

const TEST_INPUT_DIR = resolve(import.meta.dir, 'test-project-new');
const TEST_OUTPUT_DIR = resolve(import.meta.dir, 'test-dist-new');

const setup = () => {
  rmSync(TEST_INPUT_DIR, { recursive: true, force: true });
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(TEST_INPUT_DIR, { recursive: true });
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
};

const cleanup = () => {
  rmSync(TEST_INPUT_DIR, { recursive: true, force: true });
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
};

function runBundler(entryFile, outputDir) {
  const entryBuffer = Buffer.from(entryFile + '\0');
  const outputBuffer = Buffer.from(outputDir + '\0');
  const errorPtrBuffer = Buffer.alloc(8);

  const status = webs_bundle(entryBuffer, outputBuffer, errorPtrBuffer);

  if (status !== 0) {
    const errorPointerValue = errorPtrBuffer.readBigUInt64LE(0);
    const errorPtr = { ptr: Number(errorPointerValue) };

    if (errorPointerValue !== 0n) {
      const errorMessage = new CString(errorPtr).toString();
      webs_free_string(errorPtr);
      throw new Error(`Bundler failed: ${errorMessage}`);
    } else {
      throw new Error(
        `Bundler failed with status ${status} and no error message.`,
      );
    }
  }
}

describe('Webs C Bundler (Dependency Graph)', () => {
  beforeAll(() => {
    const make = Bun.spawnSync(['make']);
    if (make.exitCode !== 0) {
      throw new Error(`Compilation failed:\n${make.stderr.toString()}`);
    }
  });

  beforeEach(setup);
  afterEach(cleanup);

  test('should bundle a project with .webs and .js dependencies', () => {
    writeFileSync(
      resolve(TEST_INPUT_DIR, 'entry.js'),
      `
        import App from './App.webs';
        console.log('App mounted');
    `,
    );

    writeFileSync(
      resolve(TEST_INPUT_DIR, 'App.webs'),
      `
        <template>
          <div>
            <h1>Hello from App</h1>
            <Button />
          </div>
        </template>
        <script>
          import Button from './Button.webs';
          export default { name: 'App', components: { Button } };
        </script>
        <style>
          div { border: 1px solid black; }
        </style>
    `,
    );

    writeFileSync(
      resolve(TEST_INPUT_DIR, 'Button.webs'),
      `
        <template><button>Click Me</button></template>
        <script>
          export default { "name": "Button" }
        </script>
        <style>button { color: blue; }</style>
    `,
    );

    const entryFile = resolve(TEST_INPUT_DIR, 'entry.js');
    expect(() => runBundler(entryFile, TEST_OUTPUT_DIR)).not.toThrow();

    const jsBundlePath = resolve(TEST_OUTPUT_DIR, 'bundle.js');
    expect(existsSync(jsBundlePath)).toBe(true);
    const jsBundleContent = readFileSync(jsBundlePath, 'utf-8');

    const cssBundlePath = resolve(TEST_OUTPUT_DIR, 'bundle.css');
    expect(existsSync(cssBundlePath)).toBe(true);
    const cssBundleContent = readFileSync(cssBundlePath, 'utf-8');

    const buttonIndex = jsBundleContent.indexOf("registerComponent('Button'");
    const appIndex = jsBundleContent.indexOf("registerComponent('App'");
    const entryIndex = jsBundleContent.indexOf("console.log('App mounted')");

    expect(buttonIndex).toBeGreaterThan(-1);
    expect(appIndex).toBeGreaterThan(-1);
    expect(entryIndex).toBeGreaterThan(-1);

    expect(buttonIndex).toBeLessThan(appIndex);
    expect(appIndex).toBeLessThan(entryIndex);

    expect(cssBundleContent).toInclude('button { color: blue; }');
    expect(cssBundleContent).toInclude('div { border: 1px solid black; }');

    expect(jsBundleContent).toInclude('components: { Button }');
    expect(jsBundleContent).toInclude('<h1>Hello from App</h1>');
  });
});
