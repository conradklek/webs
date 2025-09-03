import { h, renderToString } from './renderer';
import { basename, join, resolve } from 'path';
import {
  cp as copy,
  mkdir as fsMkdir,
  readdir,
  rename,
  rm as fsRm,
  stat as fsStat,
} from 'node:fs/promises';

class ChatGateway {
  #server = null;
  #db = null;

  initialize(server, db) {
    this.#server = server;
    this.#db = db;
  }

  #publish(topic, payload) {
    this.#server.publish(topic.toLowerCase(), JSON.stringify(payload));
  }

  handleUpgrade(req) {
    const url = new URL(req.url);
    let channel = url.searchParams.get('channel');
    if (!channel) {
      return new Response("Missing 'channel' query parameter", { status: 400 });
    }

    if (channel.startsWith('#')) {
      channel = channel.substring(1);
    }

    const { user } = req;
    if (!user) {
      req.user = { id: null, username: 'anon' };
    }

    const success = this.#server.upgrade(req, {
      data: {
        user: { id: req.user.id, username: req.user.username },
        channel: `#${channel.toLowerCase()}`,
        isChatChannel: true,
      },
    });

    if (!success) {
      return new Response('WebSocket upgrade failed', { status: 500 });
    }
    return undefined;
  }

  handleOpen(ws) {
    const { user, channel } = ws.data;

    ws.subscribe(channel);
    this.#publish(channel, {
      type: 'join',
      user: user.username,
    });
  }

  handleMessage(ws, message) {
    const { user, channel } = ws.data;
    const text = message.toString().trim();

    if (!text) {
      return;
    }

    try {
      this.#db
        .query(
          'INSERT INTO chat_messages (channel, username, message, user_id) VALUES (?, ?, ?, ?)',
        )
        .run(channel, user.username, text, user.id);
      console.log(
        `[ChatGateway] Successfully inserted message for channel: ${channel}`,
      );

      this.#publish(channel, {
        type: 'message',
        from: user.username,
        text: text,
      });
    } catch (error) {
      console.error(
        `[ChatGateway] Database error on message insert: ${error.message}`,
      );
    }
  }

  handleClose(ws) {
    const { user, channel } = ws.data;
    if (user && channel) {
      this.#publish(channel, {
        type: 'part',
        user: user.username,
      });
    }
  }
}

export const chat = new ChatGateway();

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

async function hashPassword(password) {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });
}

async function verifyPassword(password, hash) {
  return Bun.password.verify(password, hash);
}

function createSession(db, userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  db.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
  ).run(sessionId, userId, expiresAt.toISOString());
  return sessionId;
}

function deleteSession(db, sessionId) {
  db.query('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

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

async function createUser(db, { email, username, password }) {
  const hashedPassword = await hashPassword(password);
  return db
    .query(
      'INSERT INTO users (email, username, password) VALUES ($email, $username, $password) RETURNING id, email, username',
    )
    .get({ $email: email, $username: username, $password: hashedPassword });
}

async function registerUser(req, db) {
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
    console.error('Registration error:', error);
    return new Response('An internal error occurred.', { status: 500 });
  }
}

async function loginUser(req, db) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response('Email and password are required.', { status: 400 });
    }
    const user = db
      .query('SELECT id, username, email, password FROM users WHERE email = ?')
      .get(email);

    if (!user) {
      return new Response('Invalid credentials.', { status: 401 });
    }

    let passwordIsValid = false;
    try {
      passwordIsValid = await verifyPassword(password, user.password);
    } catch (e) {
      if (
        e.message.includes('UnsupportedAlgorithm') &&
        password === user.password
      ) {
        const hashedPassword = await hashPassword(password);
        db.query('UPDATE users SET password = ? WHERE id = ?').run(
          hashedPassword,
          user.id,
        );
        passwordIsValid = true;
      }
    }

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
    console.error('Login error:', error);
    return new Response('An internal error occurred.', { status: 500 });
  }
}

async function logoutUser(req, db) {
  const sessionId = req.headers.get('cookie')?.match(/session_id=([^;]+)/)?.[1];
  if (sessionId) {
    deleteSession(db, sessionId);
  }
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    'session_id=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
  );
  return new Response(null, { status: 204, headers });
}

function createTableSql(table) {
  const fields = Object.entries(table.fields)
    .map(([name, type]) => `${name} ${type}`)
    .join(', ');
  const foreignKeys = table.foreignKeys
    ? Object.entries(table.foreignKeys)
        .map(
          ([field, reference]) =>
            `FOREIGN KEY (${field}) REFERENCES ${reference}`,
        )
        .join(', ')
    : '';
  const constraints = foreignKeys ? `, ${foreignKeys}` : '';
  return `CREATE TABLE IF NOT EXISTS ${table.name} (${fields}${constraints});`;
}

function createUpsertSql(table) {
  const fields = Object.keys(table.fields).join(', ');
  const placeholders = Object.keys(table.fields)
    .map(() => '?')
    .join(', ');
  const updates = Object.keys(table.fields)
    .map((field) => `${field} = excluded.${field}`)
    .join(', ');
  return `INSERT INTO ${table.name} (${fields}) VALUES (${placeholders}) ON CONFLICT(${table.keyPath}) DO UPDATE SET ${updates};`;
}

function createDeleteSql(tableName, keyPath) {
  return `DELETE FROM ${tableName} WHERE ${keyPath} = ? AND user_id = ?;`;
}

export async function createDatabaseAndActions(
  Database,
  dbConfig,
  cwd,
  writeFile,
  config,
) {
  if (!dbConfig) return null;
  if (!dbConfig.name) {
    console.error('Database file name not specified in src/sql/db.js.');
    process.exit(1);
  }

  const dbFilePath = resolve(cwd, dbConfig.name);
  const db = new Database(dbFilePath, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);`,
  );
  const lastVersionRow = db
    .query('SELECT MAX(version) as version FROM _migrations')
    .get();
  const lastVersion = lastVersionRow?.version || 0;

  if (dbConfig.version > lastVersion) {
    console.log(
      `[Build] Applying database migration to version ${dbConfig.version}.`,
    );

    db.transaction(() => {
      dbConfig.tables.forEach((table) => {
        db.exec(createTableSql(table));
      });
      db.exec(`
        INSERT INTO users (email, username, password)
        VALUES ('anon@webs.site', 'anon', 'password')
        ON CONFLICT(email) DO NOTHING;
      `);

      db.query('INSERT INTO _migrations (version) VALUES (?)').run(
        dbConfig.version,
      );
    })();
  }

  const syncTables = dbConfig.tables.filter((t) => t.sync);
  const generatedActionsContent =
    syncTables.length > 0
      ? syncTables
          .map((table) => {
            const upsertSql = createUpsertSql(table);
            const deleteSql = createDeleteSql(table.name, table.keyPath);
            const params = Object.keys(table.fields)
              .map((field) => `record.${field}`)
              .join(', ');

            return `
export async function upsert${table.name.charAt(0).toUpperCase() + table.name.slice(1)}({ db, user }, record) {
  if (!user || !user.id) {
    throw new Error('Authentication error: User ID not available.');
  }
  const stmt = db.prepare(\`${upsertSql}\`);
  stmt.run(${params});
  return { broadcast: { tableName: '${table.name}', type: 'put', data: record } };
}

export async function delete${table.name.charAt(0).toUpperCase() + table.name.slice(1)}({ db, user }, id) {
  const stmt = db.prepare(\`${deleteSql}\`);
  stmt.run(id, user.id);
  return { broadcast: { tableName: '${table.name}', type: 'delete', id } };
}
`;
          })
          .join('\n')
      : `// No syncable tables found.`;

  await writeFile(
    config.TMP_GENERATED_ACTIONS,
    `// This file is auto-generated by the Webs build process.\n// Do not edit this file directly.\n\n${generatedActionsContent}`,
  );

  return db;
}

async function exists(path) {
  try {
    await fsStat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function cat(path) {
  if (!(await exists(path))) throw new Error(`File not found at: ${path}`);
  return Bun.file(path);
}

const fs = {
  touch: async (path, data = '') => await Bun.write(path, data),
  stat: async (path) => {
    if (!path) throw new Error("Missing 'path'");
    const stats = await fsStat(path);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      birthtime: stats.birthtime,
    };
  },
  rm: async (path, recursive = false) =>
    await fsRm(path, { recursive, force: true }),
  mkdir: async (path, recursive = false) => await fsMkdir(path, { recursive }),
  mv: async (from, to) => await rename(from, to),
  ls: async (path) => await readdir(path),
  glob: async (pattern, cwd = '.') => {
    const globber = new Bun.Glob(pattern);
    return await Array.fromAsync(globber.scan(cwd));
  },
  cp: async (from, to, recursive = false) =>
    await copy(from, to, { recursive }),
  cat,
  exists,
};

function renderHtmlShell({ appHtml, websState, manifest, title }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${
      manifest.css
        ? `<link rel="stylesheet" href="/${basename(manifest.css)}">`
        : ''
    }
</head>
<body>
    <div id="root">${appHtml}</div>
    <script>window.__WEBS_STATE__ = ${serializeState(websState)};</script>
    <script type="module" src="/${basename(manifest.js)}"></script>
</body>
</html>`;
}

function serializeState(state) {
  return JSON.stringify(state, (_, value) => {
    if (value instanceof Set) return { __type: 'Set', values: [...value] };
    if (value instanceof Map)
      return { __type: 'Map', entries: [...value.entries()] };
    return value;
  });
}

async function handleStaticAssets(req, pathname, outdir, isProd) {
  const assetPath = join(outdir, basename(pathname));
  const file = Bun.file(assetPath);

  if (isProd && req.headers.get('accept-encoding')?.includes('gzip')) {
    const gzippedPath = `${assetPath}.gz`;
    if (await Bun.file(gzippedPath).exists()) {
      const headers = {
        'Content-Type': file.type,
        'Content-Encoding': 'gzip',
      };
      return new Response(Bun.file(gzippedPath), { headers });
    }
  }

  if (await file.exists()) {
    const headers = { 'Content-Type': file.type };
    if (!isProd) {
      headers['Cache-Control'] = 'no-cache';
    }
    return new Response(file, { headers });
  }

  return null;
}

async function handleAuthApi(req) {
  const { db } = req;
  const { pathname } = new URL(req.url);
  if (pathname === '/api/auth/register') return registerUser(req, db);
  if (pathname === '/api/auth/login') return loginUser(req, db);
  if (pathname === '/api/auth/logout') return logoutUser(req, db);
  return new Response('Auth route not found', { status: 404 });
}

async function handleServerActions(req, context) {
  const { appRoutes } = context;
  const { db, user } = req;

  if (!user) return new Response('Unauthorized', { status: 401 });

  const { pathname } = new URL(req.url);

  const pathParts = pathname.split('/').slice(2);
  const actionName = pathParts.pop();
  const componentName = pathParts.join('/');

  const routeDef = Object.values(appRoutes).find(
    (r) => r.componentName === componentName,
  );
  const action = routeDef?.actions?.[actionName];

  if (typeof action !== 'function') {
    console.error(
      `Action not found: component='${componentName}', action='${actionName}'. Check component for exported 'actions' object.`,
    );
    return new Response('Action not found', { status: 404 });
  }

  try {
    const args = req.method === 'POST' ? await req.json() : [];
    const actionContext = { req, db, fs, user };

    if (action.constructor.name === 'AsyncGeneratorFunction') {
      const iterator = action(actionContext, ...args);
      const stream = new ReadableStream({
        async pull(controller) {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            const chunk =
              typeof value === 'object' ? JSON.stringify(value) : String(value);
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    } else {
      const result = await action(actionContext, ...args);
      return result instanceof Response ? result : Response.json(result);
    }
  } catch (e) {
    console.error(`Action Error: ${e.message}`);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function handleDataRequest(req, routeDefinition, params) {
  const { db, user } = req;
  const props = { user, params };

  const appContext = {
    params: params,
    components: routeDefinition.component.components || {},
    db: db,
  };

  const componentVnode = h(routeDefinition.component, props);
  componentVnode.appContext = appContext;

  const { componentState } = await renderToString(componentVnode);

  const websState = {
    user: req.user,
    params: props.params,
    componentState,
    componentName: routeDefinition.componentName,
    title: routeDefinition.component.name || 'Webs App',
  };
  return new Response(serializeState(websState), {
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}

function handlePageRequest(req, routeDefinition, params, context) {
  return new Promise(async (resolve) => {
    const { manifest } = context;
    const { db, user = {} } = req;
    const url = new URL(req.url);

    let initialState = null;
    if (routeDefinition.component?.actions?.ssrFetch) {
      initialState = await routeDefinition.component.actions.ssrFetch({
        db,
        user,
      });
    }

    const props = { user: user, params, initialState };
    const fromRoute = { path: req.headers.get('referer') || null };
    const toRoute = {
      path: url.pathname,
      params,
      component: routeDefinition.component,
      user: props.user,
    };
    const middleware = routeDefinition.middleware || [];
    let index = -1;

    const next = async (path) => {
      if (path) {
        return resolve(
          new Response(null, { status: 302, headers: { Location: path } }),
        );
      }
      index++;
      if (index < middleware.length) {
        middleware[index](toRoute, fromRoute, next);
      } else {
        const appContext = {
          params: params,
          components: routeDefinition.component.components || {},
          db: db,
        };

        const componentVnode = h(routeDefinition.component, props);
        componentVnode.appContext = appContext;
        const { html: appHtml, componentState } =
          await renderToString(componentVnode);
        const websState = {
          user: req.user,
          params: props.params,
          componentState,
          componentName: routeDefinition.componentName,
          swPath: manifest.sw ? `/${basename(manifest.sw)}` : null,
        };
        const fullHtml = renderHtmlShell({
          appHtml,
          websState,
          manifest,
          title: routeDefinition.component.name || 'Webs App',
        });
        resolve(
          new Response(fullHtml, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' },
          }),
        );
      }
    };
    await next();
  });
}

export function createRequestHandler(context, findRouteMatch) {
  const { appRoutes, outdir, manifest, isProd } = context;

  return async function handleRequest(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname.startsWith('/api/auth/')) return handleAuthApi(req);
    if (pathname.startsWith('/__actions__/'))
      return handleServerActions(req, { appRoutes });

    const assetResponse = await handleStaticAssets(
      req,
      pathname,
      outdir,
      isProd,
    );
    if (assetResponse) {
      return assetResponse;
    }

    const routeMatch = findRouteMatch(appRoutes, pathname);
    if (routeMatch) {
      const { routeDefinition, params: routeParams } = routeMatch;
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const allParams = { ...routeParams, ...queryParams };

      if (req.headers.get('X-Webs-Navigate')) {
        return handleDataRequest(req, routeDefinition, allParams);
      }
      return handlePageRequest(req, routeDefinition, allParams, { manifest });
    }

    return new Response('Not Found', { status: 404 });
  };
}
