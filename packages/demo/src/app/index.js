import { use_session } from "../use/session.js";

export default {
  name: "Home",
  state() {
    return {
      count: 0,
    };
  },
  setup() {
    return {
      user_store: use_session,
    };
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-4">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1 class="mr-auto">Home</h1>
        <a href="/login" class="underline active:opacity-50 cursor-pointer">Login</a>
        <span>|</span>
        <a href="/signup" class="underline active:opacity-50 cursor-pointer">Signup</a>
      </div>
      <div w-if="user_store.is_logged_in" class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <p>Welcome, {{ user_store.current_user.username }}!</p>
        <button type="button" @click="user_store.logout()" class="active:opacity-50 cursor-pointer">Logout</button>
        <br />
        <a href="/profile" class="underline active:opacity-50 cursor-pointer">Go to Profile</a>
      </div>
      <div w-else class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <button type="button" @click="increment" class="cursor-pointer active:opacity-50">This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!</button>
      </div>
    </div>
  `,
};
