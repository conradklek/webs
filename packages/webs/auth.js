const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Hashes a password using bcrypt.
 * @param {string} password - The plaintext password to hash.
 * @returns {Promise<string>} The hashed password.
 */
async function hash_password(password) {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

/**
 * Verifies a plaintext password against a hash.
 * @param {string} password - The plaintext password.
 * @param {string} hash - The hash to compare against.
 * @returns {Promise<boolean>} True if the password is valid, false otherwise.
 */
async function verify_password(password, hash) {
  return Bun.password.verify(password, hash);
}

/**
 * Creates a new user in the database.
 * @param {object} db - The database instance.
 * @param {object} userData - The user's data.
 * @param {string} userData.email - The user's email.
 * @param {string} userData.username - The user's username.
 * @param {string} userData.password - The user's plaintext password.
 * @returns {Promise<object>} The newly created user object (without password).
 */
async function create_user(db, { email, username, password }) {
  const hashed_password = await hash_password(password);
  return db
    .query(
      "INSERT INTO users (email, username, password) VALUES ($email, $username, $password) RETURNING id, email, username",
    )
    .get({ $email: email, $username: username, $password: hashed_password });
}

/**
 * Creates a new session for a user.
 * @param {object} db - The database instance.
 * @param {number} user_id - The ID of the user to create the session for.
 * @returns {string} The newly created session ID.
 */
function create_session(db, user_id) {
  const session_id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + SESSION_DURATION_MS);
  db.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(session_id, user_id, expires_at.toISOString());
  return session_id;
}

/**
 * Deletes a session from the database.
 * @param {object} db - The database instance.
 * @param {string} session_id - The ID of the session to delete.
 */
function delete_session(db, session_id) {
  db.query("DELETE FROM sessions WHERE id = ?").run(session_id);
}

/**
 * Retrieves a user from the database based on a session ID.
 * @param {object} db - The database instance.
 * @param {string} session_id - The session ID from the client's cookie.
 * @returns {object|null} The user object if the session is valid, otherwise null.
 */
export function get_user_from_session(db, session_id) {
  if (!session_id) return null;
  const session = db
    .query("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .get(session_id);

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) delete_session(db, session_id);
    return null;
  }
  return db
    .query("SELECT id, username, email FROM users WHERE id = ?")
    .get(session.user_id);
}

/**
 * Handles user registration. Expects a JSON body with email, username, and password.
 * @param {Request} req - The incoming HTTP request.
 * @param {object} db - The database instance.
 * @returns {Promise<Response>} A response object.
 */
export async function register_user(req, db) {
  try {
    const { email, username, password } = await req.json();
    if (!email || !username || !password || password.length < 8) {
      return new Response(
        "Email, username, and a password of at least 8 characters are required.",
        { status: 400 },
      );
    }
    const existing_user = db
      .query("SELECT id FROM users WHERE email = ? OR username = ?")
      .get(email, username);
    if (existing_user) {
      return new Response(
        "A user with this email or username already exists.",
        {
          status: 409,
        },
      );
    }
    const user = await create_user(db, { email, username, password });
    return Response.json(
      { id: user.id, username: user.username, email: user.email },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return new Response("An internal error occurred.", { status: 500 });
  }
}

/**
 * Handles user login. Expects a JSON body with email and password.
 * Sets a session cookie on successful login.
 * @param {Request} req - The incoming HTTP request.
 * @param {object} db - The database instance.
 * @returns {Promise<Response>} A response object.
 */
export async function login_user(req, db) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response("Email and password are required.", { status: 400 });
    }
    const user = db
      .query("SELECT id, username, email, password FROM users WHERE email = ?")
      .get(email);
    if (!user) {
      return new Response("Invalid credentials.", { status: 401 });
    }
    const is_valid_password = await verify_password(password, user.password);
    if (!is_valid_password) {
      return new Response("Invalid credentials.", { status: 401 });
    }
    const session_id = create_session(db, user.id);
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `session_id=${session_id}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`,
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
    console.error("Login error:", error);
    return new Response("An internal error occurred.", { status: 500 });
  }
}

/**
 * Handles user logout. Deletes the session and clears the session cookie.
 * @param {Request} req - The incoming HTTP request.
 * @param {object} db - The database instance.
 * @returns {Promise<Response>} A response object.
 */
export async function logout_user(req, db) {
  const session_id = req.headers
    .get("cookie")
    ?.match(/session_id=([^;]+)/)?.[1];
  if (session_id) {
    delete_session(db, session_id);
  }
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    "session_id=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0",
  );
  return new Response(null, { status: 204, headers });
}
