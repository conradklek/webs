import { use_session } from "../use/session.js";
import { use_auth } from "../use/auth.js";

export const middleware = [use_auth];

export default {
  name: "Profile",
  props: {
    user: {
      type: Object,
      default: () => null,
    },
    params: {
      type: Object,
      default: () => ({}),
    },
  },
  methods: {
    handleLogout() {
      use_session.logout();
    },
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="font-medium">webs</a>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <h1>Profile</h1>
          <span>|</span>
          <button type="button" @click="handleLogout()" class="btn btn-default btn-size-default">Logout</button>
        </div>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-2">
        <p>This is the profile page for @{{ params.username }}.</p>
        <div w-if="user && user.username === params.username">
          <p>Your email is: {{ user.email }}</p>
        </div>
      </div>
    </div>
  `,
};
