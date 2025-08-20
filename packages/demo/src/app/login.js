import { use_session } from "../use/session.js";

export default {
  name: "Login",
  state() {
    return {
      email: "anon@webs.site",
      password: "password",
      error: null,
    };
  },
  methods: {
    async handle_login() {
      this.error = null;
      try {
        await use_session.login(this.email, this.password);
      } catch (err) {
        this.error = err.message;
      }
    },
  },
  template(html) {
    return html`
      <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
        <div class="w-full flex flex-row items-center justify-start gap-4">
          <a href="/" class="font-medium">webs.site</a>
          <div class="w-full flex flex-row items-center justify-end gap-4">
            <h1>Login</h1>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
        </div>
        <form
          @submit.prevent="handle_login"
          class="flex-1 flex flex-col items-start justify-start gap-2"
        >
          <input
            w-model="email"
            type="email"
            placeholder="Email"
            class="shrink-0"
          />
          <input
            w-model="password"
            type="password"
            placeholder="Password"
            class="shrink-0"
          />
          <button type="submit" class="mt-4">Submit</button>
        </form>
        <div w-if="error">
          <p class="text-red-700">{{ error }}</p>
        </div>
      </div>
    `;
  },
};
