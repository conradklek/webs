import { use_session } from "../use/session.js";

export default {
  name: "Profile",
  setup() {
    return {
      user_store: use_session,
    };
  },
  template: `
    <div class="p-4 flex flex-col items-start justify-start gap-4">
      <h1>Profile Page</h1>
      <div w-if="user_store.is_logged_in">
        <p>This is the profile page for {{ user_store.current_user.username }}.</p>
        <p>Your email is: {{ user_store.current_user.email }}</p>
      </div>
      <div w-else>
        <p>You must be logged in to see this page.</p>
      </div>
      <a href="/">Go to Home</a>
    </div>
  `,
};
