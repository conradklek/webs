// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/signup.webs
import { session, state, router } from "@conradklek/webs";
var signup_default = {
  template: `
  <form
    @submit.prevent="handleSignup"
    class="flex-1 max-w-xs flex flex-col items-start justify-start gap-2"
  >
    <h1 class="text-xl font-primary-serif mb-4">Create Account</h1>
    <input
      bind:value="email"
      type="email"
      placeholder="Email"
      required
      class="input"
    />
    <input
      bind:value="username"
      type="text"
      placeholder="Username"
      required
      class="input"
    />
    <input
      bind:value="password"
      type="password"
      placeholder="Password"
      required
      minlength="8"
      class="input"
    />
    <button type="submit" class="btn btn-default btn-size-lg mt-4">
      Sign Up
    </button>
    <p w-if="error" class="text-red-500 mt-2">{{ error }}</p>
  </form>
`,
  style: ``,
  name: "signup",
  setup() {
    const email = state("");
    const username = state("");
    const password = state("");
    const error = state(null);
    async function handleSignup() {
      error.value = null;
      try {
        await session.register({
          email: email.value,
          username: username.value,
          password: password.value
        });
        const user = await session.login(email.value, password.value);
        if (user && user.username) {
          router.push(`/${user.username}`);
        }
      } catch (err) {
        error.value = err.message || "An unknown error occurred.";
      }
    }
    return { email, username, password, error, handleSignup };
  }
};
export {
  signup_default as default
};
