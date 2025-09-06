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
    this.#publish(channel, { type: 'join', user: user.username });
  }

  handleMessage(ws, message) {
    const { user, channel } = ws.data;
    const text = message.toString().trim();
    if (!text) return;

    try {
      this.#db
        .query(
          'INSERT INTO chat_messages (channel, username, message, user_id) VALUES (?, ?, ?, ?)',
        )
        .run(channel, user.username, text, user.id);
      this.#publish(channel, { type: 'message', from: user.username, text });
    } catch (error) {
      console.error(`[ChatGateway] DB error: ${error.message}`);
    }
  }

  handleClose(ws) {
    const { user, channel } = ws.data;
    if (user && channel) {
      this.#publish(channel, { type: 'part', user: user.username });
    }
  }
}

export const chat = new ChatGateway();
