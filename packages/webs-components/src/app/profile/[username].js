import { useSession } from '@conradklek/webs';

function useAuth(to, _from, next) {
  if (!to.user) {
    next('/login');
  } else {
    next();
  }
}

export const middleware = [useAuth];

export default {
  name: 'Profile',
  setup() {
    function handleLogout() {
      useSession.logout();
    }
    return { handleLogout };
  },
  template(html) {
    return html`
      <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
        <div class="w-full flex flex-row items-center justify-start gap-4">
          <a href="/" class="font-medium">webs.site</a>
          <div class="w-full flex flex-row items-center justify-end gap-4">
            <h1>Profile</h1>
            <span>|</span>
            <button
              type="button"
              @click="handleLogout"
              class="btn btn-default btn-size-default"
            >
              Logout
            </button>
          </div>
        </div>
        <div class="flex-1 flex flex-col items-start justify-start gap-2">
          <p>This is the profile page for @{{$params.username}}.</p>
          <div w-if="user && user.username === $params.username">
            <p>Your email is: {{user.email}}</p>
          </div>
        </div>
      </div>
    `;
  },
};
