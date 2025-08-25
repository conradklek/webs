import { createRequestHandler } from '../../server/request-handler';
import { getUserFromSession } from '../../server/auth';
import { findRouteMatch } from './routes';
import { config } from './config';

export function startServer(serverContext) {
  const requestHandler = createRequestHandler(serverContext, findRouteMatch);

  Bun.serve({
    port: config.PORT,
    development: !config.IS_PROD,
    fetch: (req, server) => {
      const url = new URL(req.url);
      const sessionId = req.headers
        .get('cookie')
        ?.match(/session_id=([^;]+)/)?.[1];
      const user = getUserFromSession(serverContext.db, sessionId);

      if (req.headers.get('upgrade') === 'websocket') {
        if (url.pathname === '/api/sync') {
          const success = server.upgrade(req, {
            data: { user, isSyncChannel: true },
          });
          return success
            ? undefined
            : new Response('Sync upgrade failed', { status: 400 });
        }

        const routeMatch = findRouteMatch(
          serverContext.appRoutes,
          url.pathname,
        );
        if (routeMatch && routeMatch.routeDefinition.websocket) {
          const success = server.upgrade(req, {
            data: { routePath: routeMatch.path, user },
          });
          return success
            ? undefined
            : new Response('WebSocket upgrade failed', { status: 400 });
        }
      }

      return requestHandler(req);
    },
    websocket: {
      open(ws) {
        const { user, isSyncChannel, routePath } = ws.data;
        if (isSyncChannel) {
          serverContext.sync.clients.add(ws);
          ws.data.user = user;
        } else {
          const routeDef = serverContext.appRoutes[routePath];
          if (routeDef?.websocket?.open) {
            routeDef.websocket.open(ws, { db: serverContext.db, user });
          }
        }
      },
      async message(ws, message) {
        const { user, isSyncChannel, routePath } = ws.data;

        if (isSyncChannel) {
          if (!user) {
            ws.close(1008, 'Unauthorized');
            return;
          }
          try {
            const payload = JSON.parse(message);
            const { tableName, type, data, id } = payload;

            const component = Object.values(serverContext.appRoutes).find(
              (r) => r.componentName === tableName,
            );

            if (!component) {
              throw new Error(
                `Component not found for tableName: ${tableName}`,
              );
            }

            if (component.component?.actions?.sync) {
              await component.component.actions.sync(
                { db: serverContext.db, user },
                payload,
              );
            } else {
              if (type === 'put') {
                const record = { ...data, user_id: user.id };
                const columns = Object.keys(record);
                const placeholders = columns.map((key) => `$${key}`).join(', ');
                const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders});`;
                serverContext.db
                  .query(sql)
                  .run(
                    Object.fromEntries(
                      columns.map((c) => [`$${c}`, record[c]]),
                    ),
                  );
              } else if (type === 'delete') {
                const sql = `DELETE FROM ${tableName} WHERE id = ? AND user_id = ?;`;
                serverContext.db.query(sql).run(id, user.id);
              }
            }
            // Broadcast the message to all clients *except* the sender
            for (const client of serverContext.sync.clients) {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
              }
            }
          } catch (e) {
            console.error('[Sync WS] Error processing message:', e);
          }
        } else {
          const routeDef = serverContext.appRoutes[routePath];
          if (routeDef?.websocket?.message) {
            routeDef.websocket.message(ws, message, {
              db: serverContext.db,
              user,
            });
          }
        }
      },
      close(ws, code, reason) {
        const { isSyncChannel, routePath } = ws.data;
        if (isSyncChannel) {
          serverContext.sync.clients.delete(ws);
        } else {
          const routeDef = serverContext.appRoutes[routePath];
          if (routeDef?.websocket?.close) {
            routeDef.websocket.close(ws, code, reason, {
              db: serverContext.db,
              user: ws.data.user,
            });
          }
        }
      },
    },
    error: (error) => {
      console.error(error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });
}
