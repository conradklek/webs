import { useSession, useState } from '@conradklek/webs';

export default {
  name: 'Login',
  setup() {
    const email = useState('anon@webs.site');
    const password = useState('password');
    const error = useState(null);

    async function handleLogin() {
      error.value = null;
      try {
        await useSession.login(email.value, password.value);
      } catch (err) {
        error.value = err.message;
      }
    }

    return { email, password, error, handleLogin };
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
          @submit.prevent="handleLogin"
          class="flex-1 flex flex-col items-start justify-start gap-2"
        >
          <input
            w-model="email"
            type="email"
            placeholder="Email"
            class="input shrink-0"
          />
          <input
            w-model="password"
            type="password"
            placeholder="Password"
            class="input shrink-0"
          />
          <button type="submit" class="btn btn-default btn-size-lg mt-4">
            Submit
          </button>
        </form>
        <div w-if="error">
          <p class="text-red-700">{{error}}</p>
        </div>
      </div>
    `;
  },
};
