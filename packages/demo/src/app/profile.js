import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";
import { use_auth } from "../use/auth.js";

export const middleware = [use_logger, use_auth];

export default {
  name: "Profile",
  setup() {
    return {
      session: use_session,
    };
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="font-medium">webs</a>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <h1>Profile</h1>
          <span>|</span>
          <button type="button" @click="session.logout()" class="bg-primary text-white px-1.5 rounded-md cursor-pointer active:opacity-50">Logout</button>
        </div>
      </div>
      <div w-if="session.user?.username" class="flex-1 flex flex-col items-start justify-start gap-2">
        <p>This is the profile page for @{{ session.user?.username }}.</p>
        <p>Your email is: {{ session.user?.email }}</p>
      </div>
      <div w-else class="flex-1 flex flex-col items-start justify-start gap-2">
        <p>You must be logged in to see this page.</p>
      </div>
    </div>
  `,
};
