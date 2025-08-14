import { use_session } from "../use/session.js";

export default {
  name: "Home",
  state() {
    return {
      count: 0,
    }
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
    <div class="p-4 flex flex-col items-start justify-start gap-4">
      <h1>Home</h1>
      <button type="button" @click="increment" class="cursor-pointer active:opacity-50">This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!</button>
      <div w-if="user_store.is_logged_in">
        <p>Welcome, {{ user_store.current_user.username }}!</p>
        <button type="button" @click="user_store.logout()" class="active:opacity-50 cursor-pointer">Logout</button>
        <br />
        <a href="/profile" class="underline active:opacity-50 cursor-pointer">Go to Profile</a>
      </div>
      <div w-else>
        <p>You are not logged in.</p>
        <a href="/login" class="underline active:opacity-50 cursor-pointer">Go to Login</a>
      </div>
    </div>
  `,
};
