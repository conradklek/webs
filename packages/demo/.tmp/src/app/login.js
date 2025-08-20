import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";

export const middleware = [use_logger];

export default {
  name: "Login",
  state() {
    return {
      email: "anon@webs.site",
      password: "password",
    };
  },
  methods: {
    handle_login() {
      use_session.login(this.email, this.password);
    },
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="font-medium">webs</a>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <h1>Login</h1>
          <span>|</span>
          <a href="/signup">Signup</a>
        </div>
      </div>
      <form @submit.prevent="handle_login" class="flex-1 flex flex-col items-start justify-start gap-2">
        <input w-model="email" type="email" placeholder="Email" class="shrink-0" />
        <input w-model="password" type="password" placeholder="Password" class="shrink-0" />
        <button type="submit" class="mt-4">Submit</button>
      </form>
      <div w-if="use_session.error">
        <p class="text-red-700">{{ use_session.error }}</p>
      </div>
    </div>
  `,
};
