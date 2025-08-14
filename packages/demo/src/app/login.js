import { use_session } from "../use/session.js";

export default {
  name: "Login",
  state() {
    return {
      email: "anon@webs.site",
      password: "password",
    }
  },
  methods: {
    handle_login() {
      use_session.login(this.email, this.password);
    },
  },
  template: `
    <div class="p-4 flex flex-col items-start justify-start gap-4">
      <div class="flex flex-row items-center justify-start gap-4">
        <a href="/" class="underline active:opacity-50 cursor-pointer">Back</a>
        <h1>Login</h1>
      </div>
      <form @submit.prevent="handle_login" class="flex flex-col items-start justify-start">
        <input w-model="email" type="email" placeholder="Email" />
        <input w-model="password" type="password" placeholder="Password" />
        <button type="submit" class="mt-4 active:opacity-50 cursor-pointer">Login</button>
      </form>
      <div w-if="use_session.auth_error">
        <p class="text-red-700">{{ use_session.auth_error }}</p>
      </div>
    </div>
  `,
};
