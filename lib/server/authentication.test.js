import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  hashPassword,
  createSession,
  getUserFromSession,
  registerUser,
  loginUser,
  logoutUser,
} from './authentication.js';

describe('Authentication Service', () => {
  let db;

  beforeEach(() => {
    // Use an in-memory database for each test to ensure isolation
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  test('hashPassword should return a valid bcrypt hash', async () => {
    const password = 'password123';
    const hash = await hashPassword(password);
    expect(hash).toBeString();
    expect(hash).not.toBe(password);
    expect(await Bun.password.verify(password, hash)).toBe(true);
  });

  describe('Sessions', () => {
    let userId;
    beforeEach(async () => {
      const hash = await hashPassword('password');
      const result = db
        .prepare(
          'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
        )
        .run('test@example.com', 'testuser', hash);
      userId = result.lastInsertRowid;
    });

    test('createSession should create a session in the database', () => {
      const sessionId = createSession(db, userId);
      const session = db
        .query('SELECT * FROM sessions WHERE id = ?')
        .get(sessionId);
      expect(session).not.toBeNull();
      expect(session.user_id).toBe(userId);
    });

    test('getUserFromSession should retrieve a user for a valid session', () => {
      const sessionId = createSession(db, userId);
      const user = getUserFromSession(db, sessionId);
      expect(user).not.toBeNull();
      expect(user.id).toBe(userId);
      expect(user.username).toBe('testuser');
    });

    test('getUserFromSession should return null for an invalid or expired session', () => {
      // Invalid session ID
      expect(getUserFromSession(db, 'invalid-session-id')).toBeNull();

      // Expired session
      const sessionId = createSession(db, userId);
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(
        new Date(0).toISOString(),
        sessionId,
      );
      expect(getUserFromSession(db, sessionId)).toBeNull();
    });
  });

  describe('User Registration and Login', () => {
    test('registerUser should create a new user and return it', async () => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'new@example.com',
          username: 'newuser',
          password: 'password1234',
        }),
      });
      const res = await registerUser(req, db);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.username).toBe('newuser');

      const dbUser = db
        .query('SELECT * FROM users WHERE username = ?')
        .get('newuser');
      expect(dbUser).not.toBeNull();
    });

    test('registerUser should fail if username or email exists', async () => {
      await registerUser(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: 'new@example.com',
            username: 'newuser',
            password: 'password1234',
          }),
        }),
        db,
      );

      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'new@example.com',
          username: 'anotheruser',
          password: 'password1234',
        }),
      });

      const res = await registerUser(req, db);
      expect(res.status).toBe(409);
    });

    test('loginUser should return user and set session cookie on success', async () => {
      // First, register a user
      await registerUser(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: 'login@example.com',
            username: 'loginuser',
            password: 'password1234',
          }),
        }),
        db,
      );

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'login@example.com',
          password: 'password1234',
        }),
      });

      const res = await loginUser(req, db);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('loginuser');
      expect(res.headers.get('Set-Cookie')).toStartWith('session_id=');
    });

    test('loginUser should fail with invalid credentials', async () => {
      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'nouser@example.com',
          password: 'wrongpassword',
        }),
      });

      const res = await loginUser(req, db);
      expect(res.status).toBe(401);
    });

    test('logoutUser should clear the session cookie', async () => {
      const req = new Request('http://localhost/api/auth/logout', {
        headers: { Cookie: 'session_id=some-id' },
      });
      const res = await logoutUser(req, db);
      expect(res.status).toBe(204);
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });
});
