import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_fetch, webs_free_string } = lib.symbols;

let serverProcess;
let serverUrl;

// Helper to read from a stream until a condition is met
async function readUntil(stream, condition) {
  const reader = stream.getReader();
  let buffer = '';
  const decoder = new TextDecoder();

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reader.releaseLock();
      reject(new Error('Timeout waiting for server to start.'));
    }, 5000); // 5-second timeout

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (condition(buffer)) {
          clearTimeout(timeout);
          reader.releaseLock();
          resolve(buffer);
          return;
        }
      }
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
      return;
    }

    clearTimeout(timeout);
    reject(new Error('Stream ended before server started.'));
  });
}

// Wrapper function for the C fetch call
function fetchWithC(url, options = {}) {
  const urlBuffer = Buffer.from(url + '\0');
  const optionsString = JSON.stringify(options);
  const optionsBuffer = Buffer.from(optionsString + '\0');

  const resultPtr = webs_fetch(urlBuffer, optionsBuffer);
  if (!resultPtr || resultPtr.ptr === 0) {
    throw new Error('C function webs_fetch returned a null pointer.');
  }

  try {
    const jsonString = new CString(resultPtr).toString();
    return JSON.parse(jsonString);
  } finally {
    webs_free_string(resultPtr);
  }
}

describe('Webs C Fetch Module', () => {
  beforeAll(async () => {
    // Start the test server
    serverProcess = Bun.spawn({
      cmd: ['bun', 'run', 'tests/helpers/test-server.js'],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    try {
      // Wait until the server is listening
      const stdout = await readUntil(serverProcess.stdout, (text) =>
        text.includes('Listening on'),
      );

      const match = stdout.match(/http:\/\/[^\s]+/);
      if (!match) {
        const stderr = await new Response(serverProcess.stderr).text();
        throw new Error(
          `Could not find server URL in stdout.\nStderr: ${stderr}`,
        );
      }
      serverUrl = match[0];
    } catch (error) {
      const stderr = await new Response(serverProcess.stderr).text();
      throw new Error(
        `Server did not start correctly. Stderr: ${stderr}\nError: ${error.message}`,
      );
    }
  });

  afterAll(() => {
    // Stop the test server
    serverProcess.kill();
  });

  it('should perform a simple GET request', () => {
    const response = fetchWithC(`${serverUrl}/`);
    expect(response.status).toBe(200);
    expect(response.statusText.trim()).toBe('OK');
    expect(response.body).toBe('Hello World!');
    expect(response.headers['Connection']).toBe('close');
  });

  it('should get a JSON response and parse headers', () => {
    const response = fetchWithC(`${serverUrl}/json`);
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ message: 'This is JSON' });
    expect(response.headers['Content-Type']).toBe('application/json');
  });

  it('should perform a POST request with a body', () => {
    const postBody = 'Echo this content!';
    const options = {
      method: 'POST',
      body: postBody,
    };
    const response = fetchWithC(`${serverUrl}/echo`, options);
    expect(response.status).toBe(200);
    expect(response.body).toBe(postBody);
  });

  it('should handle a 404 Not Found error', () => {
    const response = fetchWithC(`${serverUrl}/non-existent-page`);
    expect(response.status).toBe(404);
    expect(response.body).toBe('Not Found');
  });

  it('should return an error for an invalid URL scheme', () => {
    const response = fetchWithC('ftp://invalid.com');
    expect(response.error).toBe('FetchError');
    expect(response.message).toBe('Unsupported scheme.');
  });

  it('should return an error for a non-existent host', () => {
    const response = fetchWithC('http://this-host-does-not-exist-12345.com');
    expect(response.error).toBe('FetchError');
    expect(response.message).toStartWith('getaddrinfo failed:');
  });
});
