import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_bundle, webs_free_string } = lib.symbols;

const TEST_INPUT_DIR = resolve(import.meta.dir, 'test-project');
const TEST_OUTPUT_DIR = resolve(import.meta.dir, 'test-dist');

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

function runBundler(inputDir, outputDir) {
  const inputBuffer = Buffer.from(inputDir + '\0');
  const outputBuffer = Buffer.from(outputDir + '\0');
  const errorPtr = webs_bundle(inputBuffer, outputBuffer);
  if (errorPtr && errorPtr.ptr !== 0) {
    const errorStr = new CString(errorPtr).toString();
    webs_free_string(errorPtr);
    throw new Error(`Bundler failed: ${errorStr}`);
  }
}

describe('Webs C Bundler', () => {
  beforeAll(() => {
    const make = Bun.spawnSync(['make']);
    if (make.exitCode !== 0) {
      throw new Error(`Compilation failed:\n${make.stderr.toString()}`);
    }
    setup();
  });

  afterAll(() => {
    cleanup();
  });

  test('should bundle .webs files into JS and CSS bundles', () => {
    writeFileSync(
      resolve(TEST_INPUT_DIR, 'App.webs'),
      `<template><h1>Hello, {{ name }}!</h1></template>
       <script>{"props": {"name": {"default": "World"}}}</script>
       <style>h1 { color: red; }</style>`,
    );
    writeFileSync(
      resolve(TEST_INPUT_DIR, 'Counter.webs'),
      `<template><button>Count: 0</button></template>
       <script>{}</script>
       <style>button { font-weight: bold; }</style>`,
    );

    expect(() => runBundler(TEST_INPUT_DIR, TEST_OUTPUT_DIR)).not.toThrow();

    const jsBundlePath = resolve(TEST_OUTPUT_DIR, 'bundle.js');
    expect(existsSync(jsBundlePath)).toBe(true);

    const jsBundleContent = readFileSync(jsBundlePath, 'utf-8');
    expect(jsBundleContent).toInclude("webs.registerComponent('App',");
    expect(jsBundleContent).toInclude("webs.registerComponent('Counter',");
    expect(jsBundleContent).toInclude(
      '"template":"<h1>Hello, {{ name }}!</h1>"',
    );
    expect(jsBundleContent).toInclude('"props":{"name":{"default":"World"}}');

    const cssBundlePath = resolve(TEST_OUTPUT_DIR, 'bundle.css');
    expect(existsSync(cssBundlePath)).toBe(true);

    const cssBundleContent = readFileSync(cssBundlePath, 'utf-8');
    expect(cssBundleContent).toInclude('h1 { color: red; }');
    expect(cssBundleContent).toInclude('button { font-weight: bold; }');
  });
});
