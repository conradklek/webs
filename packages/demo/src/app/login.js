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
    <div class="w-full p-8 flex flex-col items-start justify-start gap-4">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="underline active:opacity-50 cursor-pointer">&larr; Back</a>
        <h1 class="ml-auto font-medium">Login</h1>
        <span>|</span>
        <a href="/signup" class="underline active:opacity-50 cursor-pointer">Signup</a>
      </div>
      <form @submit.prevent="handle_login" class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <input w-model="email" type="email" placeholder="Email" class="shrink-0" />
        <input w-model="password" type="password" placeholder="Password" class="shrink-0" />
        <button type="submit" class="shrink-0 mt-4 active:opacity-50 cursor-pointer">Submit</button>
      </form>
      <div w-if="use_session.auth_error">
        <p class="text-red-700">{{ use_session.auth_error }}</p>
      </div>
    </div>
  `,
};
