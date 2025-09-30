import { symbols } from '../../bindings.js';
import { dlopen, CString, JSCallback, ptr } from 'bun:ffi';
import { resolve } from 'path';
import { URLSearchParams } from 'url';

const libPath = resolve(import.meta.dir, '../../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_server,
  webs_server_listen,
  webs_server_stop,
  webs_server_destroy,
  webs_set_log_level,
  webs_server_write_response,
  webs_http_stream_begin,
  webs_http_stream_write_chunk,
  webs_http_stream_end,
} = lib.symbols;

webs_set_log_level(4);

const host = '127.0.0.1';
const port = 0;

const handlerCallback = new JSCallback(
  (fd, request) => {
    const reqString = new CString(request).toString();
    let responseText = '';

    const firstLineEnd = reqString.indexOf('\r\n');
    const firstLine = reqString.substring(0, firstLineEnd);
    const parts = firstLine.split(' ');

    const method = parts.length > 0 ? parts[0] : '';
    let fullPath = parts.length > 1 ? parts[1] : '';
    let path = fullPath;
    let query = '';

    const headersEnd = reqString.indexOf('\r\n\r\n');
    const headerString = reqString.substring(firstLineEnd + 2, headersEnd);
    const body = reqString.substring(headersEnd + 4);

    const queryIndex = fullPath?.indexOf('?') ?? -1;
    if (fullPath && queryIndex !== -1) {
      path = fullPath.substring(0, queryIndex);
      query = fullPath.substring(queryIndex + 1);
    }

    if (method === 'GET' && path === '/stream') {
      webs_http_stream_begin(
        fd,
        200,
        Buffer.from('text/plain; charset=utf-8\0'),
      );
      const chunk1 = Buffer.from('Streaming part 1...\n');
      webs_http_stream_write_chunk(fd, ptr(chunk1), chunk1.byteLength);
      const chunk2 = Buffer.from('Streaming part 2!\n');
      webs_http_stream_write_chunk(fd, ptr(chunk2), chunk2.byteLength);
      webs_http_stream_end(fd);
      return;
    }

    if (method === 'GET' && path === '/') {
      responseText =
        'HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\nHello World!';
    } else if (method === 'GET' && path === '/json') {
      const jsonBody = '{"message":"This is JSON"}';
      responseText = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${jsonBody.length}\r\nConnection: close\r\n\r\n${jsonBody}`;
    } else if (method === 'POST' && path === '/echo') {
      responseText = `HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`;
    } else if (method === 'PUT' && path === '/update') {
      responseText = `HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`;
    } else if (method === 'PATCH' && path === '/modify') {
      const resBody = 'Patched!';
      responseText = `HTTP/1.1 200 OK\r\nContent-Length: ${resBody.length}\r\nConnection: close\r\n\r\n${resBody}`;
    } else if (method === 'DELETE' && path === '/remove') {
      const resBody = 'Deleted!';
      responseText = `HTTP/1.1 200 OK\r\nContent-Length: ${resBody.length}\r\nConnection: close\r\n\r\n${resBody}`;
    } else if (method === 'OPTIONS' && path === '/api') {
      responseText =
        'HTTP/1.1 204 No Content\r\nAllow: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\nConnection: close\r\n\r\n';
    } else if (method === 'GET' && path === '/error') {
      const resBody = 'Something went wrong';
      responseText = `HTTP/1.1 500 Internal Server Error\r\nContent-Length: ${resBody.length}\r\nConnection: close\r\n\r\n${resBody}`;
    } else if (method === 'GET' && path === '/query') {
      const params = new URLSearchParams(query);
      const received = Object.fromEntries(params.entries());
      const jsonBody = JSON.stringify({ received });
      responseText = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${jsonBody.length}\r\nConnection: close\r\n\r\n${jsonBody}`;
    } else if (method === 'GET' && path === '/headers') {
      const headers = {};
      const lines = headerString.split('\r\n');
      for (const line of lines) {
        const parts = line.split(': ');
        if (parts.length === 2) {
          headers[parts[0].toLowerCase()] = parts[1];
        }
      }
      const jsonBody = JSON.stringify(headers);
      responseText = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${jsonBody.length}\r\nConnection: close\r\n\r\n${jsonBody}`;
    } else {
      const resBody = 'Not Found';
      responseText = `HTTP/1.1 404 Not Found\r\nContent-Length: ${resBody.length}\r\nConnection: close\r\n\r\n${resBody}`;
    }

    const responseBuffer = Buffer.from(responseText + '\0');
    webs_server_write_response(fd, ptr(responseBuffer));
  },
  {
    args: ['int', 'ptr'],
    returns: 'void',
  },
);

const serverPtr = webs_server(Buffer.from(host + '\0'), port);

if (!serverPtr) {
  console.error('Failed to create server');
  process.exit(1);
}

let isShuttingDown = false;
function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  webs_server_stop(serverPtr);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

try {
  webs_server_listen(serverPtr, handlerCallback.ptr);
} finally {
  webs_server_destroy(serverPtr);
  handlerCallback.close();
}
