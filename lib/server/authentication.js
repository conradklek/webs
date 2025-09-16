import { generateUUID } from '../utils/common.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('[Auth]');
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });
}

/**
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  return Bun.password.verify(password, hash);
}

/**
 * @param {import("bun:sqlite").Database} db
 * @param {number} userId
 * @returns {string}
 */
export function createSession(db, userId) {
  const sessionId = generateUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  db.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
  ).run(sessionId, userId, expiresAt.toISOString());
  return sessionId;
}

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} sessionId
 */
function deleteSession(db, sessionId) {
  db.query('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string | undefined} sessionId
 * @returns {any}
 */
export function getUserFromSession(db, sessionId) {
  if (!sessionId) return null;
  const session = db
    .query('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .get(sessionId);

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) deleteSession(db, sessionId);
    return null;
  }
  return db
    .query('SELECT id, username, email FROM users WHERE id = ?')
    .get(session.user_id);
}

/**
 * @param {import("bun:sqlite").Database} db
 * @param {object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.username
 * @param {string} credentials.password
 */
async function createUser(db, { email, username, password }) {
  const hashedPassword = await hashPassword(password);
  return db
    .query(
      'INSERT INTO users (email, username, password) VALUES ($email, $username, $password) RETURNING id, email, username',
    )
    .get({ $email: email, $username: username, $password: hashedPassword });
}

/**
 * @param {Request} req
 * @param {import("bun:sqlite").Database} db
 * @returns {Promise<Response>}
 */
export async function registerUser(req, db) {
  try {
    const { email, username, password } = await req.json();
    if (!email || !username || !password || password.length < 8) {
      return new Response(
        'Email, username, and a password of at least 8 characters are required.',
        { status: 400 },
      );
    }
    const existingUser = db
      .query('SELECT id FROM users WHERE email = ? OR username = ?')
      .get(email, username);
    if (existingUser) {
      return new Response(
        'A user with this email or username already exists.',
        { status: 409 },
      );
    }
    const user = await createUser(db, { email, username, password });
    return Response.json(
      { id: user.id, username: user.username, email: user.email },
      { status: 201 },
    );
  } catch (error) {
    logger.error('Registration error:', error);
    return new Response('An internal error occurred.', { status: 500 });
  }
}

/**
 * @param {Request} req
 * @param {import("bun:sqlite").Database} db
 * @returns {Promise<Response>}
 */
export async function loginUser(req, db) {
  try {
    const { email, password } = await req.json();
    if (!email || !password)
      return new Response('Email and password are required.', { status: 400 });

    const user = db
      .query('SELECT id, username, email, password FROM users WHERE email = ?')
      .get(email);
    if (!user) return new Response('Invalid credentials.', { status: 401 });

    const passwordIsValid = await verifyPassword(password, user.password);
    if (!passwordIsValid) {
      return new Response('Invalid credentials.', { status: 401 });
    }

    const sessionId = createSession(db, user.id);
    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${
        SESSION_DURATION_MS / 1000
      }`,
    );
    return new Response(
      JSON.stringify({
        id: user.id,
        email: user.email,
        username: user.username,
      }),
      { headers },
    );
  } catch (error) {
    logger.error('Login error:', error);
    const typedError = /** @type {Error & { code?: string }} */ (error);
    if (
      typedError.name === 'PasswordVerificationFailed' &&
      typedError.code === 'PASSWORD_UNSUPPORTED_ALGORITHM'
    ) {
      logger.error(
        'Password verification failed: The stored password hash is in an unsupported format.',
      );
      return new Response(
        'Password verification failed: The stored password hash is in an unsupported format.',
        { status: 500 },
      );
    }
    return new Response('An internal error occurred.', { status: 500 });
  }
}
/**
 * @param {Request} req
 * @param {import("bun:sqlite").Database} db
 * @returns {Promise<Response>}
 */
export async function logoutUser(req, db) {
  const sessionId = req.headers.get('cookie')?.match(/session_id=([^;]+)/)?.[1];
  if (sessionId) deleteSession(db, sessionId);
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    'session_id=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
  );
  return new Response(null, { status: 204, headers });
}
