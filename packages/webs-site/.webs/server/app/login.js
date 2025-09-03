// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/login.webs
import { session, state, router } from "@conradklek/webs";
var login_default = {
  template: `
  <form
    @submit.prevent="handleLogin"
    class="flex-1 max-w-xs flex flex-col items-start justify-start gap-2"
  >
    <h1 class="text-xl font-primary-serif mb-4">Login</h1>
    <input bind:value="email" type="email" placeholder="Email" class="input" />
    <input
      bind:value="password"
      type="password"
      placeholder="Password"
      class="input"
    />
    <button type="submit" class="btn btn-default btn-size-lg mt-4">
      Submit
    </button>
    <p w-if="error" class="text-red-500 mt-2">{{ error }}</p>
  </form>
`,
  style: ``,
  name: "login",
  setup() {
    const email = state("anon@webs.site");
    const password = state("password");
    const error = state(null);
    async function handleLogin() {
      error.value = null;
      try {
        const user = await session.login(email.value, password.value);
        if (user && user.username) {
          router.push(`/${user.username}`);
        }
      } catch (err) {
        error.value = err.message;
      }
    }
    return { email, password, error, handleLogin };
  }
};
export {
  login_default as default
};
