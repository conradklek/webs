import { registerUser, loginUser, logoutUser } from './authentication.js';
import { createFileSystemForUser } from './fs.server.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('[API]');

/**
 * Converts an async generator into a streaming Response object.
 * @param {AsyncGenerator<any>} generator The async generator to stream.
 * @param {HeadersInit} headers Headers for the Response.
 * @returns {Response} A streaming Response.
 */
function generatorToStreamResponse(generator, headers) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const value of generator) {
          controller.enqueue(encoder.encode(String(value)));
        }
      } catch (e) {
        logger.error('Error in streaming generator response:', e);
        // The error will be propagated to the client through the stream.
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers });
}

/**
 * @typedef {import('bun:sqlite').Database} BunDatabase
 * @typedef {import('./ai.server.js').AgentDefinition} AgentDefinition
 * @typedef {import('./ai.server.js').ChatContext} ChatContext
 */

/**
 * @typedef {'public' | 'private'} FileAccessLevel
 */

/**
 * @typedef {object} ApiContext
 * @property {BunDatabase} db
 * @property {import('./ai.server.js').AI} ai
 * @property {Record<string, Function>} syncActions
 * @property {string} SYNC_TOPIC
 * @property {Record<string, AgentDefinition>} [agentRoutes]
 * @property {ChatContext} [chatContext]
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
        const generator = ai.generate(prompt, options);
        return generatorToStreamResponse(generator, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
      }

      const chatMatch = pathname.match(/^\/api\/ai\/chats\/?([a-zA-Z0-9-]+)?$/);
      if (chatMatch) {
        const chatId = chatMatch[1];
        const chatContext = { db, user: req.user, syncActions, server };

        if (req.method === 'GET' && !chatId) {
          const chats = await ai.getChats(chatContext);
          return Response.json(chats);
        }
        if (req.method === 'PATCH' && chatId) {
          const updates = await req.json();
          const updated = await ai.updateChat(chatId, updates, chatContext);
          return Response.json(updated);
        }
        if (req.method === 'DELETE' && chatId) {
          const result = await ai.deleteChat(chatId, chatContext);
          return Response.json(result);
        }
      }

      if (pathname.endsWith('/chats/new') && req.method === 'POST') {
        const { message, options } = await req.json();
        const { chatId } = await ai.createChat(
          { message, options },
          { db, user: req.user, syncActions, server },
        );
        return new Response(null, {
          status: 302,
          headers: { Location: `/chat/${chatId}` },
        });
      }

      if (pathname.endsWith('/chat') && req.method === 'POST') {
        const { messages, options } = await req.json();
        const generator = ai.chat(messages, options);
        return generatorToStreamResponse(generator, {
          'Content-Type': 'text/plain; charset=utf-8',
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
          ai,
        };

        const generator = ai.agent(messages, agentDef, toolContext, options);
        return generatorToStreamResponse(generator, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
        });
      }

      if (pathname.endsWith('/search/files') && req.method === 'POST') {
        const { query, limit } = await req.json();
        const results = await ai.search(query, limit, {
          userId: req.user.id,
        });
        return Response.json(results);
      }

      if (pathname.startsWith('/api/ai/models/')) {
        if (pathname.endsWith('/list'))
          return Response.json((await ai.list()) || []);
        if (pathname.endsWith('/pull') && req.method === 'POST') {
          const { model } = await req.json();
          const pullGenerator = ai.pull(model);
          return generatorToStreamResponse(pullGenerator, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
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
