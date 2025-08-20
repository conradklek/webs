const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

async function hash_password(password) {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

async function verify_password(password, hash) {
  return Bun.password.verify(password, hash);
}

export function create_session(db, user_id) {
  const session_id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + SESSION_DURATION_MS);
  db.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(session_id, user_id, expires_at.toISOString());
  return session_id;
}

export function delete_session(db, session_id) {
  db.query("DELETE FROM sessions WHERE id = ?").run(session_id);
}

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

export async function create_user(db, { email, username, password }) {
  const hashed_password = await hash_password(password);
  return db
    .query(
      "INSERT INTO users (email, username, password) VALUES ($email, $username, $password) RETURNING id, email, username",
    )
    .get({ $email: email, $username: username, $password: hashed_password });
}

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
        { status: 409 },
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

export async function login_user(req, db) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response("Email and password are required.", { status: 400 });
    }
    const user = db
      .query("SELECT id, username, email, password FROM users WHERE email = ?")
      .get(email);
    if (!user || !(await verify_password(password, user.password))) {
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
