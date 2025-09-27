import { symbols } from '../../bindings.js';
import { dlopen, CString, JSCallback, ptr } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_server,
  webs_server_listen,
  webs_server_stop,
  webs_server_destroy,
  webs_set_log_level,
} = lib.symbols;

const host = '127.0.0.1';
const port = 8081;

webs_set_log_level(0);

const handlerCallback = new JSCallback(
  (request) => {
    const reqString = new CString(request).toString();
    let responseText = '';

    if (reqString.startsWith('PUT /update')) {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 3\r\n\r\nPUT';
    } else if (reqString.startsWith('DELETE /resource')) {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 6\r\n\r\nDELETE';
    } else if (reqString.startsWith('PATCH /modify')) {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nPATCH';
    } else if (reqString.startsWith('HEAD /')) {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 12\r\n\r\n';
    } else if (reqString.startsWith('OPTIONS /')) {
      responseText =
        'HTTP/1.1 204 No Content\r\nAllow: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS\r\nContent-Length: 0\r\n\r\n';
    } else if (reqString.startsWith('GET / ')) {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 12\r\n\r\nHello World!';
    } else if (reqString.startsWith('POST /submit')) {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 4\r\n\r\nECHO';
    } else {
      responseText =
        'HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found';
    }

    const responseBuffer = Buffer.from(responseText + '\0');
    return ptr(responseBuffer);
  },
  {
    args: ['ptr'],
    returns: 'ptr',
  },
);

const serverPtr = webs_server(Buffer.from(host + '\0'), port);

if (!serverPtr) {
  console.error('Failed to create server');
  process.exit(1);
}

function gracefulShutdown() {
  console.log('\\nShutting down server gracefully...');
  webs_server_stop(serverPtr);
  setTimeout(() => {
    webs_server_destroy(serverPtr);
    handlerCallback.close();
    console.log('Server shutdown complete.');
    process.exit(0);
  }, 100);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

webs_server_listen(serverPtr, handlerCallback.ptr);
