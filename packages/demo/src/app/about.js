export default {
  name: "About",
  state: () => ({
    count: 0,
    message: "This is a demonstration of client-side routing!",
  }),
  actions: {
    async backendCall({ db }) {
      console.log("Hello on the server!");
      return JSON.stringify(
        db.query("SELECT id, email FROM users").all(),
        null,
        2,
      );
    },
  },
  methods: {
    async triggerAction() {
      this.message = await this.actions.backendCall();
    },
  },
  template: `
    <div class="p-4 flex flex-col items-start justify-start gap-4">
      <h1>/about</h1>
      <button type="button" @click="triggerAction" class="cursor-pointer active:opacity-50">
        {{ message }}
      </button>
      <a href="/" class="inline-flex underline active:opacity-50">&larr; Go back home</a>
      <a href="/login" class="inline-flex underline active:opacity-50">Login &rarr;</a>
    </div>
  `,
};
