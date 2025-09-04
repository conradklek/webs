// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/irc/[channel].webs
import { useTable, state, onReady, watch, session } from "@conradklek/webs";
var __channel__default = {
  name: "[channel]",
  template: `
  <div class="chat-container">
    <h2 class="p-2 border-b border-gray-300 font-bold bg-gray-100 rounded-t-lg">
      {{ formattedChannelName }}
    </h2>
    <div class="message-list">
      <div
        w-for="msg in messages.state.data"
        :key="msg.id"
        class="message-item"
      >
        <div class="py-1 px-2 flex">
          <span class="font-bold mr-2 text-left flex-shrink-0"
            >&lt;{{ msg.username }}&gt;</span
          >
          <span class="break-words min-w-0">{{ msg.message }}</span>
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <form @submit.prevent="handleSend" class="w-full">
        <input
          type="text"
          bind:value="currentMessage"
          placeholder="{{ session.user ? 'Type a message...' : 'You must be logged in to chat.' }}"
          class="chat-input"
          :disabled="!session.user"
        />
      </form>
    </div>
  </div>
`,
  style: `.chat-container {
    @apply text-sm font-mono border border-gray-300 h-full flex flex-col bg-white rounded-lg shadow-md;
  }
  .message-list {
    @apply flex-grow p-2 overflow-y-auto;
  }
  .chat-input-area {
    @apply border-t border-gray-300 flex items-center bg-gray-50 rounded-b-lg;
  }
  .chat-input {
    @apply w-full p-2 focus:outline-none text-sm font-mono bg-transparent disabled:bg-gray-100 disabled:cursor-not-allowed;
  }`,
  actions: {
    async ssrFetch(context) {
      const { db, params } = context;
      const channel = `#${params.channel.toLowerCase()}`;
      try {
        const history = db.query(`SELECT id, channel, username, message, user_id, created_at FROM chat_messages WHERE channel = ? ORDER BY created_at ASC`).all(channel);
        return { history };
      } catch (error) {
        console.error(`[SSR] Error fetching history for ${channel}:`, error);
        return { history: [] };
      }
    }
  },
  setup(props, ctx) {
    const formattedChannelName = `#${ctx.params.channel.toLowerCase()}`;
    const initialState = props.initialState || {};
    const messages = useTable("chat_messages");
    const currentMessage = state("");
    const messageListEl = state(null);
    onReady(() => {
      messages.hydrate(initialState.history || []);
      messageListEl.value = document.querySelector(".message-list");
      setTimeout(() => {
        if (messageListEl.value) {
          messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
        }
      }, 50);
    });
    const handleSend = async () => {
      const msg = currentMessage.value.trim();
      if (msg && session.user) {
        await messages.put({
          id: crypto.randomUUID(),
          channel: formattedChannelName,
          username: session.user.username,
          message: msg,
          user_id: session.user.id,
          created_at: new Date().toISOString()
        });
        currentMessage.value = "";
      }
    };
    watch(() => messages.state.data, () => {
      setTimeout(() => {
        if (messageListEl.value) {
          messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
        }
      }, 0);
    });
    return {
      formattedChannelName,
      session,
      messages,
      currentMessage,
      handleSend
    };
  }
};
export {
  __channel__default as default
};
