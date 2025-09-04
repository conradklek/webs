// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/irc/index.webs
var irc_default = {
  name: "index",
  template: `
  <div class="w-full max-w-lg mx-auto">
    <h1 class="text-2xl font-bold mb-4">IRC Channels</h1>
    <div w-if="channels.length > 0" class="flex flex-col gap-2">
      <div
        w-for="channel in channels"
        :key="channel"
        class="border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors duration-200"
      >
        <a
          :href="'/irc/' + channel.replace('#', '')"
          class="block text-blue-600 font-medium hover:underline"
          >{{ channel }}</a
        >
      </div>
    </div>
    <div
      w-if="!channels.length"
      class="text-gray-500 text-center p-8 border border-dashed rounded-lg"
    >
      No active channels. Start one by navigating to /irc/your-channel-name.
    </div>
  </div>
`,
  style: ``,
  name: "irc-index",
  actions: {
    async ssrFetch({ db }) {
      const channels = db.query(`SELECT DISTINCT channel FROM chat_messages ORDER BY channel ASC`).all();
      return { channels: channels.map((c) => c.channel) };
    }
  },
  props: {
    initialState: {
      default: () => ({ channels: [] })
    }
  },
  setup(props) {
    return { channels: props.initialState.channels };
  }
};
export {
  irc_default as default
};
