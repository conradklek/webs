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
    @layer components {
      .btn { @apply bg-primary text-white px-2 py-0.5 rounded-md cursor-pointer active:opacity-50; }
    }
  `,
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-4">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1 class="mr-auto font-medium">Home</h1>
        <div w-if="!session.is_logged_in" class="flex flex-row items-center justify-start gap-4">
          <a href="/login" class="underline active:opacity-50 cursor-pointer">Login</a>
          <span>|</span>
          <a href="/signup" class="underline active:opacity-50 cursor-pointer">Signup</a>
        </div>
        <div w-else class="flex flex-row items-center justify-start gap-4">
          <button type="button" @click="session.logout()" class="btn">Logout</button>
          <span>|</span>
          <a href="/profile" class="underline active:opacity-50 cursor-pointer">Profile &rarr;</a>
        </div>
      </div>
      <div w-if="session.is_logged_in" class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <p>Welcome back, @{{ session.current_user.username }}!</p>
      </div>
      <div w-else class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <button type="button" @click="increment" class="cursor-pointer active:opacity-50">This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!</button>
      </div>
    </div>
  `,
};
