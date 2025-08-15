import { use_session } from "../use/session.js";

export default {
  name: "Signup",
  state() {
    return {
      email: "",
      username: "",
      password: "",
    };
  },
  methods: {
    handle_signup() {
      use_session.register({
        email: this.email,
        username: this.username,
        password: this.password,
      });
    },
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-4">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="underline active:opacity-50 cursor-pointer">&larr; Back</a>
        <h1 class="ml-auto">Signup</h1>
        <span>|</span>
        <a href="/login" class="underline active:opacity-50 cursor-pointer">Login</a>
      </div>
      <form @submit.prevent="handle_signup" class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <input w-model="email" type="email" placeholder="Email" required class="shrink-0" />
        <input w-model="username" type="text" placeholder="Username" required class="shrink-0" />
        <input w-model="password" type="password" placeholder="Password (min. 8 characters)" required minlength="8" class="shrink-0" />
        <button type="submit" class="shrink-0 mt-4 active:opacity-50 cursor-pointer">Create Account</button>
      </form>
      <div w-if="use_session.auth_error">
        <p class="text-red-700">{{ use_session.auth_error }}</p>
      </div>
    </div>
  `,
};
