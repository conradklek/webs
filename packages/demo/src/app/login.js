import { use_session } from "../use/session.js";

export default {
  name: "Login",
  state: () => ({
    email: "anon@webs.site",
    password: "password",
  }),
  methods: {
    handle_login() {
      use_session.login(this.email, this.password);
    },
  },
  template: `
    <div class="p-4 flex flex-col items-start justify-start gap-4">
      <h1>Login Page</h1>
      <form @submit.prevent="handle_login" class="flex flex-col items-start justify-start">
        <input w-model="email" type="email" placeholder="Email" />
        <input w-model="password" type="password" placeholder="Password" />
        <button type="submit">Login</button>
      </form>
      <div w-if="use_session.auth_error">
        <p class="text-red-700">{{ use_session.auth_error }}</p>
      </div>
    </div>
  `,
};
