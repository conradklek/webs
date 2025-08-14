import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import {
  rm,
  mkdir,
  touch,
  exists,
  cat,
  ls,
  stat,
  copy,
  mv,
  glob,
} from "./filesystem";

const TMP_DIR = join(import.meta.dir, "tmp-test-fs");

describe("Filesystem API", () => {
  beforeEach(async () => {
    await mkdir(TMP_DIR, true);
  });

  afterEach(async () => {
    await rm(TMP_DIR, true);
  });

  test("exists should check for files and directories", async () => {
    const filePath = join(TMP_DIR, "file.txt");
    await touch(filePath);
    expect(await exists(filePath)).toBe(true);
    expect(await exists(join(TMP_DIR, "nonexistent.txt"))).toBe(false);
  });

  test("touch and cat should create and read files", async () => {
    const filePath = join(TMP_DIR, "file.txt");
    const content = "hello world";
    await touch(filePath, content);
    const file = await cat(filePath);
    const text = await file.text();
    expect(text).toBe(content);
  });

  test("cat should throw if file not found", async () => {
    await expect(cat(join(TMP_DIR, "nonexistent.txt"))).rejects.toThrow(
      "File not found",
    );
  });

  test("mkdir and ls should create and list directories", async () => {
    const dirPath = join(TMP_DIR, "subdir");
    await mkdir(dirPath);
    await touch(join(dirPath, "a.txt"));
    const contents = await ls(dirPath);
    expect(contents).toEqual(["a.txt"]);
  });

  test("rm should remove files and directories", async () => {
    const filePath = join(TMP_DIR, "file.txt");
    await touch(filePath);
    expect(await exists(filePath)).toBe(true);
    await rm(filePath);
    expect(await exists(filePath)).toBe(false);
  });

  test("stat should get file stats", async () => {
    const filePath = join(TMP_DIR, "file.txt");
    await touch(filePath, "12345");
    const stats = await stat(filePath);
    expect(stats.is_file).toBe(true);
    expect(stats.size).toBe(5);
  });

  test("copy should copy files and directories recursively", async () => {
    const fromPath = join(TMP_DIR, "from.txt");
    const toPath = join(TMP_DIR, "to.txt");
    await touch(fromPath, "content");
    await copy(fromPath, toPath);
    expect(await exists(toPath)).toBe(true);

    const fromDir = join(TMP_DIR, "fromDir");
    const toDir = join(TMP_DIR, "toDir");
    await mkdir(fromDir);
    await touch(join(fromDir, "file.txt"));
    await copy(fromDir, toDir, true);
    expect(await exists(join(toDir, "file.txt"))).toBe(true);
  });

  test("copy should throw on non-recursive directory copy", async () => {
    const fromDir = join(TMP_DIR, "fromDir");
    await mkdir(fromDir);
    await expect(copy(fromDir, join(TMP_DIR, "toDir"), false)).rejects.toThrow(
      "Source is a directory but 'recursive' flag is not set.",
    );
  });

  test("mv should move/rename files", async () => {
    const fromPath = join(TMP_DIR, "from.txt");
    const toPath = join(TMP_DIR, "to.txt");
    await touch(fromPath, "content");
    await mv(fromPath, toPath);
    expect(await exists(fromPath)).toBe(false);
    expect(await exists(toPath)).toBe(true);
  });

  test("glob should find matching files", async () => {
    await touch(join(TMP_DIR, "a.js"));
    await touch(join(TMP_DIR, "b.js"));
    await touch(join(TMP_DIR, "c.txt"));
    const matches = await glob("*.js", TMP_DIR);
    expect(matches.sort()).toEqual(["a.js", "b.js"]);
  });
});
