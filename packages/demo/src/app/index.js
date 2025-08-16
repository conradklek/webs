import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";

export const middleware = [use_logger];

export default {
  name: "Home",
  state() {
    return {
      count: 0,
    };
  },
  setup() {
    return {
      session: use_session,
    };
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  styles: `
    @theme {
      --color-primary: #1e40af;
    }
    @layer base {
      h1     { @apply font-medium; }
      button { @apply cursor-pointer active:opacity-50 whitespace-nowrap; }
      a      { @apply underline cursor-pointer active:opacity-50 whitespace-nowrap; }
    }
    @layer components {
      .button-primary { @apply bg-primary text-white px-1.5 rounded-md cursor-pointer active:opacity-50; }
    }
  `,
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1>webs</h1>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <div w-if="!session.user.username" class="flex flex-row items-center justify-start gap-4">
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
          <div w-else class="flex flex-row items-center justify-start gap-4">
            <button type="button" @click="session.logout()" class="button-primary">Logout</button>
            <span>|</span>
            <a href="/profile">Profile &rarr;</a>
          </div>
        </div>
      </div>
      <div w-if="session.user.username" class="flex-1 flex flex-col items-start justify-start gap-2">
        <p>Welcome back, @{{ session.user.username }}!</p>
      </div>
      <div w-else class="flex-1 flex flex-col items-start justify-start gap-2">
        <button type="button" @click="increment">
          This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!
        </button>
      </div>
    </div>
  `,
};
