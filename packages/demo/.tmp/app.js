import { hydrate } from "@conradklek/webs";
const components = {
  'profile': () => import('../src/app/profile.js'),
  'index': () => import('../src/app/index.js'),
  'signup': () => import('../src/app/signup.js'),
  'login': () => import('../src/app/login.js')
};
hydrate(components);