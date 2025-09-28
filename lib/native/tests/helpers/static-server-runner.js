import { symbols } from '../../bindings.js';
import { dlopen } from 'bun:ffi';
import { resolve } from 'path';

const publicDir = process.argv[2];
if (!publicDir) {
  console.error('Error: No public directory specified.');
  process.exit(1);
}

const libPath = resolve(import.meta.dir, '../../.webs.dylib');
const lib = dlopen(libPath, symbols);
const { webs_static_server } = lib.symbols;

const host = '127.0.0.1';
const port = 0;

const hostBuffer = Buffer.from(host + '\0');
const publicDirBuffer = Buffer.from(publicDir + '\0');

const exitCode = webs_static_server(hostBuffer, port, publicDirBuffer);

process.exit(Number(exitCode));
