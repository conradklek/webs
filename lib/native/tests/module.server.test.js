import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

let serverProcess;
let serverUrl;

async function readUntil(stream, condition) {
  const reader = stream.getReader();
  let buffer = '';
  const decoder = new TextDecoder();

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reader.releaseLock();
      reject(new Error('Timeout waiting for server to start.'));
    }, 5000);

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

describe('C HTTP Server End-to-End Tests', () => {
  beforeAll(async () => {
    const make = Bun.spawnSync(['make']);
    if (make.exitCode !== 0) {
      throw new Error(`Compilation failed:\n${make.stderr.toString()}`);
    }

    serverProcess = Bun.spawn({
      cmd: ['bun', 'run', 'tests/helpers/test-server.js'],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    try {
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
    serverProcess.kill();
  });

  it("should respond with 'Hello World!' on GET /", async () => {
    const response = await fetch(`${serverUrl}/`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('Hello World!');
  });

  it('should respond with JSON on GET /json', async () => {
    const response = await fetch(`${serverUrl}/json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const data = await response.json();
    expect(data).toEqual({ message: 'This is JSON' });
  });

  it('should echo the request body on POST /echo', async () => {
    const body = 'This is a test body.';
    const response = await fetch(`${serverUrl}/echo`, {
      method: 'POST',
      body: body,
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe(body);
  });

  it('should handle multiple concurrent requests', async () => {
    const numRequests = 20;
    const promises = [];

    for (let i = 0; i < numRequests; i++) {
      const body = `Request ${i}`;
      const promise = fetch(`${serverUrl}/echo`, {
        method: 'POST',
        body: body,
      }).then(async (response) => {
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toBe(body);
        return text;
      });
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(numRequests);
  });

  it('should respond with a 404 for an unknown route', async () => {
    const response = await fetch(`${serverUrl}/not-a-real-page`);
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe('Not Found');
  });
});
