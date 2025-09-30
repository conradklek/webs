import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
} from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';
import { unlinkSync, existsSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_auth_hash_password,
  webs_auth_verify_password,
  webs_free_string,
  webs_router_create,
  webs_router_free,
  webs_test_run_router_logic,
} = lib.symbols;

const TEST_API_DB_PATH = resolve(import.meta.dir, '../api_test.db');

describe('Webs C Auth Module', () => {
  // ... password hashing and verification tests remain the same
  test('should hash a password into a non-plain-text string', () => {
    const password = 'mysecretpassword';
    const passwordBuffer = Buffer.from(password + '\0');
    const hashPtr = webs_auth_hash_password(passwordBuffer);
    const hash = new CString(hashPtr).toString();
    webs_free_string(hashPtr);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9+/=]+$/.test(hash)).toBe(true);
  });

  test('should verify a correct password', () => {
    const password = 'password123';
    const passwordBuffer = Buffer.from(password + '\0');
    const hashPtr = webs_auth_hash_password(passwordBuffer);
    const hash = new CString(hashPtr).toString();

    const hashBuffer = Buffer.from(hash + '\0');
    const is_valid = webs_auth_verify_password(passwordBuffer, hashBuffer);

    webs_free_string(hashPtr);
    expect(is_valid).toBe(true);
  });

  test('should not verify an incorrect password', () => {
    const password = 'password123';
    const wrongPassword = 'password456';

    const passwordBuffer = Buffer.from(password + '\0');
    const hashPtr = webs_auth_hash_password(passwordBuffer);
    const hash = new CString(hashPtr).toString();
    webs_free_string(hashPtr);

    const wrongPasswordBuffer = Buffer.from(wrongPassword + '\0');
    const hashBuffer = Buffer.from(hash + '\0');
    const is_valid = webs_auth_verify_password(wrongPasswordBuffer, hashBuffer);

    expect(is_valid).toBe(false);
  });
});

describe('Webs C Auth API Handlers', () => {
  let routerPtr = null;

  beforeAll(() => {
    routerPtr = webs_router_create();
  });

  afterAll(() => {
    if (routerPtr) webs_router_free(routerPtr);
  });

  beforeEach(() => {
    if (existsSync(TEST_API_DB_PATH)) {
      unlinkSync(TEST_API_DB_PATH);
    }
  });

  function runApiTestRequest(requestObj) {
    const requestJson = JSON.stringify(requestObj);
    const requestBuffer = Buffer.from(requestJson + '\0');

    const responsePtr = webs_test_run_router_logic(routerPtr, requestBuffer);
    if (!responsePtr || responsePtr.ptr === 0) {
      return {
        statusCode: 500,
        headers: {},
        body: 'C function returned null pointer.',
      };
    }

    try {
      const fullResponse = new CString(responsePtr).toString();
      const statusLineEnd = fullResponse.indexOf('\r\n');
      if (statusLineEnd === -1) {
        return {
          statusCode: 500,
          headers: {},
          body: 'Invalid HTTP response format.',
        };
      }

      const statusLine = fullResponse.substring(0, statusLineEnd);
      const statusParts = statusLine.split(' ');
      const statusCode =
        statusParts.length > 1 ? parseInt(statusParts[1], 10) : 500;

      const headers = {};
      const bodyStart = fullResponse.indexOf('\r\n\r\n');
      if (bodyStart !== -1) {
        const headerBlock = fullResponse.substring(
          statusLineEnd + 2,
          bodyStart,
        );
        const headerLines = headerBlock.split('\r\n');
        headerLines.forEach((line) => {
          const separatorIndex = line.indexOf(': ');
          if (separatorIndex > 0) {
            const key = line.substring(0, separatorIndex);
            const value = line.substring(separatorIndex + 2);
            headers[key] = value;
          }
        });
      }
      const body =
        bodyStart !== -1 ? fullResponse.substring(bodyStart + 4) : '';

      try {
        const jsonBody = JSON.parse(body);
        return { statusCode, headers, body: jsonBody };
      } catch (e) {
        return { statusCode, headers, body };
      }
    } finally {
      webs_free_string(responsePtr);
    }
  }

  test('should register a new user successfully', () => {
    const request = {
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    };
    const response = runApiTestRequest(request);
    expect(response.statusCode).toBe(201);
    expect(response.body.message).toBe('User registered successfully');
  });

  test('should fail to register an existing user', () => {
    runApiTestRequest({
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    const response = runApiTestRequest({
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    expect(response.statusCode).toBe(409);
    expect(response.body.message).toBe('User already exists');
  });

  test('should log in an existing user and receive a session cookie', () => {
    runApiTestRequest({
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    const response = runApiTestRequest({
      method: 'POST',
      path: '/login',
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe('Login successful');
    expect(response.headers['Set-Cookie']).toStartWith('session_id=');
    expect(response.headers['Set-Cookie']).toInclude('HttpOnly');
  });

  test('should access a protected route with a valid session cookie', () => {
    runApiTestRequest({
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'authtest', password: 'password' }),
    });
    const loginResponse = runApiTestRequest({
      method: 'POST',
      path: '/login',
      body: JSON.stringify({ username: 'authtest', password: 'password' }),
    });
    const cookie = loginResponse.headers['Set-Cookie'].split(';')[0];
    const protectedResponse = runApiTestRequest({
      method: 'GET',
      path: '/users/123',
      headers: { cookie },
    });
    expect(protectedResponse.body).toInclude(
      'User Handler Called for ID: 123 (Authenticated as authtest)',
    );
  });

  test('should log out a user and expire the session cookie', () => {
    runApiTestRequest({
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'logouttest', password: 'password' }),
    });
    const loginResponse = runApiTestRequest({
      method: 'POST',
      path: '/login',
      body: JSON.stringify({ username: 'logouttest', password: 'password' }),
    });
    const cookie = loginResponse.headers['Set-Cookie'].split(';')[0];
    const logoutResponse = runApiTestRequest({
      method: 'POST',
      path: '/logout',
      headers: { cookie },
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.body.message).toBe('Logout successful');
    expect(logoutResponse.headers['Set-Cookie']).toInclude('Max-Age=0');
    const protectedResponse = runApiTestRequest({
      method: 'GET',
      path: '/users/456',
      headers: { cookie },
    });
    expect(protectedResponse.body).toInclude(
      'User Handler Called for ID: 456 (Unauthenticated)',
    );
  });

  test('should fail to log in with an incorrect password', () => {
    runApiTestRequest({
      method: 'POST',
      path: '/register',
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    const response = runApiTestRequest({
      method: 'POST',
      path: '/login',
      body: JSON.stringify({ username: 'testuser', password: 'wrongpassword' }),
    });
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe('Invalid credentials');
  });
});
