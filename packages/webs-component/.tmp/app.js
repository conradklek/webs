
import { hydrate } from "@conradklek/webs/runtime";

const components = new Map([
  ['index', () => import('../src/app/index.js')],
  ['signup', () => import('../src/app/signup.js')],
  ['login', () => import('../src/app/login.js')],
  ['chat', () => import('../src/app/chat.js')],
  ['profile/[username]', () => import('../src/app/profile/[username].js')],
  ['components/[component]', () => import('../src/app/components/[component].js')]
]);

hydrate(components);
