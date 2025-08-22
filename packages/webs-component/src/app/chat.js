import { useSocket } from "@conradklek/webs/websocket";

export default {
  name: "Chat",

  state() {
    return {
      messages: [],
    };
  },

  setup({ onMounted }) {
    const socket = useSocket();
    socket.connect();

    onMounted(() => {
      socket.onMessage((message) => {
        console.log({ message });
        this.messages.push(message);
      });
    });
  },

  methods: {
    sendMessage(event) {
      const socket = useSocket();
      const message = event.target.message.value;
      if (!message.trim()) return;
      socket.send(message);
      event.target.reset();
    },
  },

  template(html) {
    return html`
      <div class="w-full max-w-2xl mx-auto p-4 flex flex-col h-[80vh]">
        <main class="flex-1 bg-muted rounded-lg p-4 overflow-y-auto">
          <ul class="space-y-2">
            <li w-for="message in messages">{{ message }}</li>
          </ul>
        </main>

        <footer class="mt-4">
          <form @submit.prevent="sendMessage" class="flex gap-2">
            <input
              name="message"
              type="text"
              placeholder="Type a message..."
              class="input flex-1"
            />
            <button type="submit" class="btn btn-default btn-size-lg">
              Send
            </button>
          </form>
        </footer>
      </div>
    `;
  },

  websocket: {
    open(ws, context) {
      const { user } = context;
      const username = user ? user.username : "Anonymous";
      ws.subscribe("global-chat");
      const joinMsg = `[${username} has joined the chat]`;
      ws.publish("global-chat", joinMsg);
      ws.send(joinMsg);
    },

    message(ws, message, context) {
      const { user } = context;
      const username = user ? user.username : "Anonymous";
      const formattedMessage = `${username}: ${message}`;
      ws.publish("global-chat", formattedMessage);
      ws.send(formattedMessage);
    },

    close(ws, _code, _message, context) {
      const { user } = context;
      const username = user ? user.username : "Anonymous";
      ws.publish("global-chat", `[${username} has left the chat]`);
    },
  },
};
