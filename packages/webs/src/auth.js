const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

async function hashPassword(password) {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

async function verifyPassword(password, hash) {
  return Bun.password.verify(password, hash);
}

export function createSession(db, userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  db.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(sessionId, userId, expiresAt.toISOString());
  return sessionId;
}

export function deleteSession(db, sessionId) {
  db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function getUserFromSession(db, sessionId) {
  if (!sessionId) return null;
  const session = db
    .query("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .get(sessionId);

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) deleteSession(db, sessionId);
    return null;
  }
  return db
    .query("SELECT id, username, email FROM users WHERE id = ?")
    .get(session.user_id);
}

export async function createUser(db, { email, username, password }) {
  const hashedPassword = await hashPassword(password);
  return db
    .query(
      "INSERT INTO users (email, username, password) VALUES ($email, $username, $password) RETURNING id, email, username",
    )
    .get({ $email: email, $username: username, $password: hashedPassword });
}

export async function registerUser(req, db) {
  try {
    const { email, username, password } = await req.json();
    if (!email || !username || !password || password.length < 8) {
      return new Response(
        "Email, username, and a password of at least 8 characters are required.",
        { status: 400 },
      );
    }
    const existingUser = db
      .query("SELECT id FROM users WHERE email = ? OR username = ?")
      .get(email, username);
    if (existingUser) {
      return new Response(
        "A user with this email or username already exists.",
        { status: 409 },
      );
    }
    const user = await createUser(db, { email, username, password });
    return Response.json(
      { id: user.id, username: user.username, email: user.email },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return new Response("An internal error occurred.", { status: 500 });
  }
}

export async function loginUser(req, db) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response("Email and password are required.", { status: 400 });
    }
    const user = db
      .query("SELECT id, username, email, password FROM users WHERE email = ?")
      .get(email);
    if (!user || !(await verifyPassword(password, user.password))) {
      return new Response("Invalid credentials.", { status: 401 });
    }
    const sessionId = createSession(db, user.id);
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`,
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

export async function logoutUser(req, db) {
  const sessionId = req.headers.get("cookie")?.match(/session_id=([^;]+)/)?.[1];
  if (sessionId) {
    deleteSession(db, sessionId);
  }
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    "session_id=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0",
  );
  return new Response(null, { status: 204, headers });
}
