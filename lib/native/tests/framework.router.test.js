import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';
import { unlinkSync, existsSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_router_create,
  webs_router_free,
  webs_test_run_router_logic,
  webs_free_string,
} = lib.symbols;

const TEST_API_DB_PATH = resolve(import.meta.dir, '../api_test.db');

describe('Webs C Native Router', () => {
  let routerPtr = null;

  beforeAll(() => {
    if (existsSync(TEST_API_DB_PATH)) {
      unlinkSync(TEST_API_DB_PATH);
    }
    routerPtr = webs_router_create();
    expect(routerPtr).not.toBe(null);
  });

  afterAll(() => {
    if (routerPtr) {
      webs_router_free(routerPtr);
    }
    if (existsSync(TEST_API_DB_PATH)) {
      unlinkSync(TEST_API_DB_PATH);
    }
  });

  function runTestRequest(requestObj) {
    const requestJson = JSON.stringify(requestObj);
    const requestBuffer = Buffer.from(requestJson + '\0');

    const responsePtr = webs_test_run_router_logic(routerPtr, requestBuffer);
    if (!responsePtr || responsePtr.ptr === 0) {
      return '';
    }

    try {
      return new CString(responsePtr).toString();
    } finally {
      webs_free_string(responsePtr);
    }
  }

  function getCookieFromResponse(rawResponse) {
    const match = rawResponse.match(/Set-Cookie: (session_id=[^;]+)/);
    return match ? match[1] : null;
  }

  test('should match the root GET route', () => {
    const request = { method: 'GET', path: '/' };
    const response = runTestRequest(request);
    expect(response).toInclude('Root Handler Called');
  });

  test('should match a dynamic GET route and extract params', () => {
    const request = { method: 'GET', path: '/users/123' };
    const response = runTestRequest(request);
    expect(response).toInclude('User Handler Called for ID: 123');
  });

  test('should match a route with multiple dynamic parameters', () => {
    const request = { method: 'GET', path: '/posts/2025/09' };
    const response = runTestRequest(request);
    expect(response).toInclude('Posts for 09/2025');
  });

  test('should match a POST route and handle body content', () => {
    const request = { method: 'POST', path: '/data', body: 'hello world' };
    const response = runTestRequest(request);
    expect(response).toInclude('POST Handled: hello world');
  });

  test('should ignore query parameters when matching route', () => {
    const request = { method: 'GET', path: '/users/456?sort=asc' };
    const response = runTestRequest(request);
    expect(response).toInclude('User Handler Called for ID: 456');
  });

  test('should return a 404 for a non-matching route', () => {
    const request = { method: 'GET', path: '/non/existent/route' };
    const response = runTestRequest(request);
    expect(response).toInclude('404 Not Found');
  });

  test('should run middleware for an unauthenticated user', () => {
    const request = { method: 'GET', path: '/users/777' };
    const response = runTestRequest(request);
    expect(response).toInclude(
      'User Handler Called for ID: 777 (Unauthenticated)',
    );
  });

  test('should run middleware and authenticate a user', () => {
    const registerRequest = {
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'Test User', password: 'password' }),
    };
    runTestRequest(registerRequest);

    const loginRequest = {
      method: 'POST',
      path: '/login',
      body: JSON.stringify({ username: 'Test User', password: 'password' }),
    };
    const loginResponse = runTestRequest(loginRequest);
    const sessionCookie = getCookieFromResponse(loginResponse);
    expect(sessionCookie).not.toBeNull();

    const request = {
      method: 'GET',
      path: '/users/999',
      headers: {
        cookie: sessionCookie,
      },
    };
    const response = runTestRequest(request);
    expect(response).toInclude(
      'User Handler Called for ID: 999 (Authenticated as Test User)',
    );
  });

  test('should not match if the method is different', () => {
    const request = { method: 'POST', path: '/' };
    const response = runTestRequest(request);
    expect(response).toInclude('404 Not Found');
  });

  test('should handle another dynamic route correctly', () => {
    const request = { method: 'GET', path: '/users/abc-xyz' };
    const response = runTestRequest(request);
    expect(response).toInclude('User Handler Called for ID: abc-xyz');
  });
});
