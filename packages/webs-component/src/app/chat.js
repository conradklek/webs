import { useAction } from "@conradklek/webs/client";

export default {
  name: "Chat",

  state() {
    return {
      messages: [],
      streamAction: null,
    };
  },

  setup({ onReady }) {
    onReady(() => {
      this.streamAction = useAction("streamMessage");
    });
  },

  methods: {
    sendMessage(event) {
      if (!this.streamAction) return;

      const form = event.target;
      const input = form.message;
      const messageContent = input.value.trim();

      if (!messageContent) return;

      this.messages.push({ role: "user", content: messageContent });

      this.streamAction.stream(messageContent, {
        onFinish: (finalResponse) => {
          this.messages.push({
            role: "assistant",
            content: finalResponse,
          });
        },
      });

      form.reset();
    },
  },

  actions: {
    async *streamMessage(context, message) {
      console.log(`[Server Action] Received message: "${message}"`);
      const mockResponse =
        "This is a mock streamed response from the server. Each word is sent as a separate chunk to demonstrate how the UI can update in real-time, just like a real AI chat application.".split(
          " ",
        );

      for (const word of mockResponse) {
        yield word + " ";
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
  },

  template(html) {
    return html`
      <div class="w-full max-w-2xl mx-auto p-4 flex flex-col h-[80vh]">
        <main class="flex-1 bg-muted rounded-lg p-4 overflow-y-auto">
          <ul class="space-y-4">
            <li w-for="message in messages">
              <div class="max-w-lg p-3">
                <p class="font-bold capitalize mb-1">{{ message.role }}</p>
                <p>{{ message.content }}</p>
              </div>
            </li>
            <li w-if="streamAction && streamAction.state.isStreaming">
              <div class="max-w-lg p-3">
                <p class="font-bold capitalize mb-1">Assistant</p>
                <p>{{ streamAction.state.currentResponse }}</p>
              </div>
            </li>
          </ul>
        </main>

        <footer class="mt-4">
          <form @submit.prevent="sendMessage" class="flex gap-2">
            <input
              name="message"
              type="text"
              placeholder="Type a message..."
              class="input flex-1"
              autocomplete="off"
            />
            <button type="submit" class="btn btn-default btn-size-lg">
              Send
            </button>
          </form>
        </footer>
      </div>
    `;
  },
};
