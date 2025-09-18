import { registerUser, loginUser, logoutUser } from './authentication.js';
import { createFileSystemForUser } from './fs.server.js';
import { createLogger } from '../developer/logger.js';

const logger = createLogger('[API]');

/**
 * @typedef {import('bun:sqlite').Database} BunDatabase
 * @typedef {import('../ai/ai.server.js').AgentDefinition} AgentDefinition
 * @typedef {import('../ai/ai.server.js').ConversationContext} ConversationContext
 */

/**
 * @typedef {'public' | 'private'} FileAccessLevel
 */

/**
 * @typedef {object} ApiContext
 * @property {BunDatabase} db
 * @property {import('../ai/ai.server.js').AI} ai
 * @property {Record<string, Function>} syncActions
 * @property {string} SYNC_TOPIC
 * @property {Record<string, AgentDefinition>} [agentRoutes]
 * @property {ConversationContext} [conversationContext]
 */

/**
 * @param {Request & { user?: any }} req
 * @param {import('bun').Server} server
 * @param {ApiContext} context
 */
export async function handleApiRequest(req, server, context) {
  const { db, ai, syncActions, agentRoutes } = context;
  const url = new URL(req.url);
  const { pathname } = url;

  if (pathname.startsWith('/api/ai/')) {
    if (!req.user) return new Response('Unauthorized', { status: 401 });
    try {
      if (pathname.endsWith('/generate') && req.method === 'POST') {
        const { prompt, options } = await req.json();
        const stream = await ai.generate(prompt, options);
        return new Response(stream, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const agentRunMatch = pathname.match(/^\/api\/ai\/agent\/run\/(.+)$/);
      if (agentRunMatch && req.method === 'POST') {
        const agentName = agentRunMatch[1];
        if (!agentName) {
          return new Response(`Agent name is missing.`, {
            status: 400,
          });
        }
        const agentDef = agentRoutes && agentRoutes[agentName];

        if (!agentDef) {
          return new Response(`Agent '${agentName}' not found.`, {
            status: 404,
          });
        }

        const { messages, options } = await req.json();

        const toolContext = {
          db,
          user: req.user,
          fs: createFileSystemForUser(req.user.id),
        };

        const stream = await ai.agent(messages, agentDef, toolContext, options);
        return new Response(stream, {
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        });
      }

      if (pathname.endsWith('/search/files') && req.method === 'POST') {
        const { query, limit } = await req.json();
        const results = await ai.search(query, limit, {
          userId: req.user.id,
        });
        return Response.json(results);
      }
      if (pathname.endsWith('/chat') && req.method === 'POST') {
        const { messages, options } = await req.json();
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
          const body = new ReadableStream({
            async start(controller) {
              for await (const chunk of pullStream) {
                controller.enqueue(
                  new TextEncoder().encode(JSON.stringify(chunk) + '\n'),
                );
              }
              controller.close();
            },
          });
          return new Response(body, {
            headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
          });
        }
        if (pathname.endsWith('/delete') && req.method === 'POST') {
          const { model } = await req.json();
          await ai.delete(model);
          return Response.json({ success: true, model });
        }
      }
    } catch (err) {
      logger.error('AI API Error:', err);
      const error = /** @type {Error} */ (err);
      return new Response(error.message, { status: 500 });
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
        url.searchParams.get('access') === 'private' ? 'private' : 'public';

      if (!req.body) {
        return new Response('Request body is missing', { status: 400 });
      }
      await fs.write(filePath, req.body, { access });

      const fileBlob = await fs.cat(filePath, { access });
      const fileContent = await fileBlob.text();
      const stats = await fs.stat(filePath, { access });

      await ai.indexFile(
        { path: filePath, content: fileContent },
        { userId: req.user.id },
      );

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
      const error = /** @type {Error} */ (err);
      return new Response(`Upload failed: ${error.message}`, { status: 500 });
    }
  }

  if (pathname.startsWith('/api/auth/')) {
    if (pathname.endsWith('/register')) return registerUser(req, db);
    if (pathname.endsWith('/login')) return loginUser(req, db);
    if (pathname.endsWith('/logout')) return logoutUser(req, db);
  }

  return null;
}
