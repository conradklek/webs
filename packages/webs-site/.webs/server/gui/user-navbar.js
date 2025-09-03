// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/user-navbar.webs
import { session } from "@conradklek/webs";
var user_navbar_default = {
  template: `
  <div class="flex-1">
    <div class="w-full flex flex-row items-center justify-end gap-4">
      <nav w-if="!user" class="contents">
        <a href="/login" class="link">Login</a>
        <span>|</span>
        <a href="/signup" class="link">Signup</a>
      </nav>
      <nav w-else class="contents">
        <a :href="'/' + user.username" class="link">@{{ user.username }}</a>
        <span>|</span>
        <button type="button" @click="handleLogout" class="link">Logout</button>
      </nav>
    </div>
  </div>
`,
  style: ``,
  name: "user-navbar",
  props: {
    user: Object
  },
  setup(props) {
    function handleLogout() {
      session.logout();
      window.location.href = "/";
    }
    return { ...props, session, handleLogout };
  }
};
export {
  user_navbar_default as default
};
