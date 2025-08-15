import { use_session } from "../use/session.js";
import { use_auth } from "../use/auth.js";
import { use_logger } from "../use/logger.js";

export const middleware = [use_logger, use_auth];

export default {
  name: "Profile",
  setup() {
    return {
      session: use_session,
    };
  },
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-4">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <a href="/" class="underline active:opacity-50 cursor-pointer">&larr; Back</a>
        <h1 class="ml-auto font-medium">Profile</h1>
        <span>|</span>
        <button type="button" @click="session.logout()" class="btn">Logout</button>
      </div>
      <div w-if="session.is_logged_in" class="w-full mt-4 flex flex-col items-start justify-start gap-2">
        <p>This is the profile page for @{{ session.current_user.username }}.</p>
        <p>Your email is: {{ session.current_user.email }}</p>
      </div>
      <div w-else>
        <p>You must be logged in to see this page.</p>
      </div>
    </div>
  `,
};
