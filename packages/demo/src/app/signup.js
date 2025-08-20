import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";

export const middleware = [use_logger];

export default {
  name: "Signup",
  state() {
    return {
      email: "",
      username: "",
      password: "",
      error: null,
    };
  },
  methods: {
    async handle_signup() {
      this.error = null;
      try {
        await use_session.register({
          email: this.email,
          username: this.username,
          password: this.password,
        });
      } catch (err) {
        this.error = use_session.error || "An unknown error occurred.";
      }
    },
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="font-medium">webs</a>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <a href="/login">Login</a>
          <span>|</span>
          <h1>Signup</h1>
        </div>
      </div>
      <form @submit.prevent="handle_signup" class="flex-1 flex flex-col items-start justify-start gap-2">
        <input w-model="email" type="email" placeholder="Email" required />
        <input w-model="username" type="text" placeholder="Username" required />
        <input w-model="password" type="password" placeholder="Password" required minlength="8" />
        <button type="submit" class="mt-4">Create Account</button>
      </form>
      <div w-if="error">
        <p class="text-red-700">{{ error }}</p>
      </div>
    </div>
  `,
};
