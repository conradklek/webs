// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/login.webs
import { session, state, router, onReady } from "@conradklek/webs";
var login_default = {
  name: "login",
  template: `
  <form
    @submit.prevent="handleLogin"
    class="flex-1 max-w-xs mx-auto mt-8 flex flex-col items-start justify-start gap-2"
  >
    <input bind:value="email" type="email" placeholder="Email" class="input" />
    <input
      bind:value="password"
      type="password"
      placeholder="Password"
      class="input"
    />
    <button type="submit" class="btn btn-default btn-size-lg w-full mt-4">
      Enter
    </button>
    <p w-if="error" class="text-red-500 mt-2">{{ error }}</p>
  </form>
`,
  style: ``,
  setup() {
    const email = state("");
    const password = state("");
    const error = state(null);
    onReady(() => {
      if (session.isLoggedIn) {
        router.push(`/${session.user.username}`);
      }
    });
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
    return { email, password, error, handleLogin, session };
  }
};
export {
  login_default as default
};
