import { registerUser, loginUser, logoutUser } from './authentication.js';
import { createFileSystemForUser } from './fs.server.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('[API]');

/**
 * @typedef {import('./fs.server.js').FileAccessLevel} FileAccessLevel
 */

/**
 * @param {Request & { user?: any }} req
 * @param {import('bun').Server} server
 * @param {object} context
 * @param {import('bun:sqlite').Database} context.db
 * @param {import('../ai/ai.server.js').AI} context.ai
 * @param {Record<string, Function>} context.syncActions
 * @param {string} context.SYNC_TOPIC
 */
export async function handleApiRequest(req, server, context) {
  const { db, ai, syncActions } = context;
  const url = new URL(req.url);
  const { pathname } = url;

  if (pathname.startsWith('/api/ai/')) {
    if (!req.user) return new Response('Unauthorized', { status: 401 });
    try {
      if (pathname.endsWith('/search/files') && req.method === 'POST') {
        const { query, limit } = await req.json();
        const results = await ai.search(query, limit, {
          userId: req.user.id,
        });
        return Response.json(results);
      }
      if (pathname.endsWith('/chat') && req.method === 'POST') {
        const { messages, options } = await req.json();

        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          lastMessage.user_id = req.user.id;
        }

        const stream = await ai.chat(messages, options);
        return new Response(stream, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      if (pathname.startsWith('/api/ai/models/')) {
        if (pathname.endsWith('/list'))
          return Response.json((await ai.list())?.models || []);
        if (pathname.endsWith('/pull') && req.method === 'POST') {
          const { model } = await req.json();
          const pullStream = await ai.pull(model);
          return new Response(/** @type {ReadableStream<any>} */ (pullStream), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          });
        }
        if (pathname.endsWith('/delete') && req.method === 'POST') {
          const { model } = await req.json();
          await ai.delete(model);
          return Response.json({ success: true, model });
        }
      }
    } catch (err) {
      logger.error('AI API Error:', /** @type {Error} */ (err));
      return new Response(/** @type {Error} */ (err).message, { status: 500 });
    }
  }

  if (pathname.startsWith('/api/fs/') && req.method === 'PUT') {
    if (!req.user) return new Response('Unauthorized', { status: 401 });
    const filePath = decodeURIComponent(pathname.substring('/api/fs/'.length));
    if (!filePath)
      return new Response('File path is required', { status: 400 });

    try {
      const fs = createFileSystemForUser(req.user.id);
      /** @type {FileAccessLevel} */
      const access =
        /** @type {FileAccessLevel} */ (url.searchParams.get('access')) ||
        'private';

      if (!req.body) {
        return new Response('Request body is missing', { status: 400 });
      }
      await fs.write(filePath, req.body, { access });

      const fileBlob = await fs.cat(filePath, { access });
      const fileContent = await fileBlob.arrayBuffer();
      const stats = await fs.stat(filePath, { access });

      await ai.indexFile(filePath, await fileBlob.text(), {
        userId: req.user.id,
      });

      const record = {
        path: filePath,
        user_id: req.user.id,
        content: fileContent,
        access: access,
        size: stats.size,
        last_modified: new Date().toISOString(),
      };

      if (syncActions.upsertFiles) {
        const result = syncActions.upsertFiles({ user: req.user }, record);
        if (result?.broadcast) {
          server.publish(
            context.SYNC_TOPIC,
            JSON.stringify({ type: 'sync', data: result.broadcast }),
          );
        }
      }

      return new Response(JSON.stringify({ success: true, path: filePath }), {
        status: 201,
      });
    } catch (err) {
      logger.error('Upload Error:', err);
      return new Response(
        `Upload failed: ${/** @type {Error} */ (err).message}`,
        { status: 500 },
      );
    }
  }

  if (pathname.startsWith('/api/auth/')) {
    if (pathname.endsWith('/register')) return registerUser(req, db);
    if (pathname.endsWith('/login')) return loginUser(req, db);
    if (pathname.endsWith('/logout')) return logoutUser(req, db);
  }

  return null;
}
