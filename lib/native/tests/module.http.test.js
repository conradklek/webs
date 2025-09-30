import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_parse_http_request, webs_free_string } = lib.symbols;

function parseHttpRequestWithC(requestString) {
  const requestBuffer = Buffer.from(requestString);
  const resultPtr = webs_parse_http_request(requestBuffer);
  if (!resultPtr || resultPtr.ptr === 0) {
    throw new Error(
      'C function webs_parse_http_request returned null pointer.',
    );
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

describe('Webs C HTTP Request Parser', () => {
  test('should parse a simple GET request', () => {
    const rawRequest =
      'GET /test/path HTTP/1.1\r\n' +
      'Host: localhost:8080\r\n' +
      'User-Agent: test-suite\r\n' +
      '\r\n';

    const parsed = parseHttpRequestWithC(rawRequest);

    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/test/path');
    expect(parsed.version).toBe('HTTP/1.1');
    expect(parsed.headers).toEqual({
      host: 'localhost:8080',
      'user-agent': 'test-suite',
    });
  });

  test('should handle requests with no headers', () => {
    const rawRequest = 'GET / HTTP/1.0\r\n\r\n';
    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/');
    expect(parsed.version).toBe('HTTP/1.0');
    expect(parsed.headers).toEqual({});
  });

  test('should handle header values with spaces', () => {
    const rawRequest =
      'POST /submit HTTP/1.1\r\n' +
      'Content-Type: application/json\r\n' +
      'X-Custom-Header: Some value with spaces\r\n' +
      '\r\n';

    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.method).toBe('POST');
    expect(parsed.headers).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'Some value with spaces',
    });
  });

  test('should handle different line endings (LF only)', () => {
    const rawRequest =
      'GET /test HTTP/1.1\n' +
      'Host: example.com\n' +
      'Connection: keep-alive\n' +
      '\n';

    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/test');
    expect(parsed.headers['host']).toBe('example.com');
    expect(parsed.headers['connection']).toBe('keep-alive');
  });

  test('should parse headers with leading/trailing whitespace in value', () => {
    const rawRequest =
      'GET / HTTP/1.1\r\n' + 'My-Header:   value with spaces   \r\n' + '\r\n';
    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.headers['my-header']).toBe('value with spaces');
  });

  test('should handle request path with query string', () => {
    const rawRequest =
      'GET /api/data?id=123&name=test HTTP/1.1\r\nHost: api.com\r\n\r\n';
    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.path).toBe('/api/data');
    expect(parsed.query).toBe('id=123&name=test');
  });

  test('should throw on malformed request line', () => {
    const rawRequest = 'GET\r\nHost: example.com\r\n\r\n';
    expect(() => parseHttpRequestWithC(rawRequest)).toThrow(
      'Malformed request line',
    );
  });

  test('should handle empty request gracefully', () => {
    const rawRequest = '';
    expect(() => parseHttpRequestWithC(rawRequest)).toThrow(
      'Request is empty or malformed',
    );
  });

  test('should parse a request with a body', () => {
    const body = '{"key":"value"}';
    const rawRequest =
      `POST /api HTTP/1.1\r\n` +
      `Host: example.com\r\n` +
      `Content-Length: ${body.length}\r\n` +
      `Content-Type: application/json\r\n` +
      `\r\n` +
      `${body}`;

    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.method).toBe('POST');
    expect(parsed.headers['content-length']).toBe(String(body.length));
    expect(parsed.body).toBe(body);
  });

  test('should handle case-insensitivity in header keys', () => {
    const rawRequest = 'GET / HTTP/1.1\r\n' + 'hOsT: example.com\r\n\r\n';
    const parsed = parseHttpRequestWithC(rawRequest);
    expect(parsed.headers['host']).toBe('example.com');
  });
});
