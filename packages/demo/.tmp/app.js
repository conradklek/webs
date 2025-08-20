import { hydrate } from "@conradklek/webs";
const components = new Map([
  ['profile', () => import('../src/app/profile.js')],
  ['index', () => import('../src/app/index.js')],
  ['signup', () => import('../src/app/signup.js')],
  ['login', () => import('../src/app/login.js')],
  ['components', () => import('../src/app/components.js')]
]);
hydrate(components);