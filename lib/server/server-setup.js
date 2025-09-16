import { exists, mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { hashPassword } from './authentication.js';
import { generateUUID } from '../utils/common.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('[Dev]');

/**
 * @param {string} dirPath
 */
export async function ensureDir(dirPath) {
  if (!(await exists(dirPath))) await mkdir(dirPath, { recursive: true });
}

/**
 * @param {import('bun:sqlite').Database} db
 * @param {import('./server-config.js').Config} config
 * @param {import('../ai/ai.server.js').AI} ai
 */
export async function seedDevDatabase(db, config, ai) {
  const anonUser = {
    email: 'anon@webs.site',
    username: 'anon',
    password: 'password',
  };
  let existingUser = db
    .query('SELECT id FROM users WHERE username = ?')
    .get(anonUser.username);
  let anonUserId;

  if (existingUser) {
    anonUserId = existingUser.id;
  } else {
    const hashedPassword = await hashPassword(anonUser.password);
    const result = db
      .prepare('INSERT INTO users (email, username, password) VALUES (?, ?, ?)')
      .run(anonUser.email, anonUser.username, hashedPassword);
    anonUserId = result.lastInsertRowid;
  }

  if (!anonUserId) return;

  const anonPrivateDir = join(
    config.USER_FILES_ROOT,
    String(anonUserId),
    'private',
  );
  await ensureDir(anonPrivateDir);

  const seedFiles = {
    'welcome.txt': 'Welcome to your new Webs file system!',
    'docs/webs-framework.md':
      '# Webs Framework\n\nThe Webs framework is a modern, file-based, full-stack JavaScript framework.',
    'docs/ai-features.md':
      '# AI Features\n\nThe framework includes a powerful AI module for semantic search and Retrieval-Augmented Generation (RAG).',
  };

  for (const [filePath, content] of Object.entries(seedFiles)) {
    const fullPath = join(anonPrivateDir, filePath);
    await ensureDir(dirname(fullPath));

    if (!(await exists(fullPath))) {
      logger.info(`Seeding file: '${filePath}'...`);
      await writeFile(fullPath, content);
      if (
        !db
          .query('SELECT path FROM files WHERE path = ? AND user_id = ?')
          .get(filePath, anonUserId)
      ) {
        const now = new Date().toISOString();
        const fileRecord = {
          path: filePath,
          user_id: anonUserId,
          access: 'private',
          size: content.length,
          last_modified: now,
          updated_at: now,
          content: Buffer.from(content),
        };
        const insertStmt = db.prepare(
          'INSERT INTO files (path, user_id, access, size, last_modified, updated_at, content) VALUES ($path, $user_id, $access, $size, $last_modified, $updated_at, $content)',
        );

        const params = Object.fromEntries(
          Object.entries(fileRecord).map(([key, value]) => [`$${key}`, value]),
        );
        insertStmt.run(params);

        await ai.indexFile(filePath, content, { userId: anonUserId });
      }
    }
  }

  const todoCount =
    db
      .query('SELECT COUNT(*) as count FROM todos WHERE user_id = ?')
      .get(anonUserId)?.count || 0;
  if (todoCount === 0) {
    logger.info('Seeding initial todos for anon user.');
    /** @type {{ id: string; content: string; completed: number; user_id: any; }[]} */
    const seedTodos = [
      {
        id: generateUUID(),
        content: 'Explore the Webs framework',
        completed: 1,
        user_id: anonUserId,
      },
      {
        id: generateUUID(),
        content: 'Build something awesome',
        completed: 0,
        user_id: anonUserId,
      },
      {
        id: generateUUID(),
        content: 'Check out the local-first sync',
        completed: 0,
        user_id: anonUserId,
      },
    ];
    const insert = db.prepare(
      'INSERT INTO todos (id, content, completed, user_id, created_at, updated_at) VALUES ($id, $content, $completed, $user_id, $created_at, $updated_at)',
    );
    const insertTx = db.transaction((todos) => {
      for (const todo of todos) {
        const now = new Date().toISOString();
        const params = Object.fromEntries(
          Object.entries({ ...todo, created_at: now, updated_at: now }).map(
            ([key, value]) => [`$${key}`, value],
          ),
        );
        insert.run(params);
      }
    });
    insertTx(seedTodos);
  }
}
