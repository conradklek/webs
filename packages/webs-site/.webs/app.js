import { hydrate } from '@conradklek/webs';
import '/Users/conradklek/webs/packages/webs-site/.webs/tmp.css';
import dbConfig from '/Users/conradklek/webs/packages/webs-site/src/sql/db.js';

const componentLoaders = new Map([
  ['gui/card-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/card-demo.js')],
  ['gui/menubar-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/menubar-demo.js')],
  ['gui/tabs-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/tabs-demo.js')],
  ['gui/breadcrumb', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/breadcrumb.js')],
  ['gui/todo-list', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/todo-list.js')],
  ['gui/menubar', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/menubar.js')],
  ['gui/modal-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/modal-demo.js')],
  ['gui/tabs', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/tabs.js')],
  ['gui/breadcrumb-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/breadcrumb-demo.js')],
  ['gui/radio-group-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/radio-group-demo.js')],
  ['gui/checkbox', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/checkbox.js')],
  ['gui/user-navbar', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/user-navbar.js')],
  ['gui/accordion-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/accordion-demo.js')],
  ['gui/card', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/card.js')],
  ['gui/modal', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/modal.js')],
  ['gui/checkbox-demo', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/checkbox-demo.js')],
  ['gui/radio-group', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/radio-group.js')],
  ['gui/accordion', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/gui/accordion.js')],
  ['app/layout', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/layout.js')],
  ['app/index', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/index.js')],
  ['app/signup', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/signup.js')],
  ['app/login', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/login.js')],
  ['app/[username]', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/[username].js')],
  ['app/components/[component]', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/components/[component].js')],
  ['app/components/index', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/components/index.js')],
  ['app/irc/layout', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/irc/layout.js')],
  ['app/irc/[channel]', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/irc/[channel].js')],
  ['app/irc/index', () => import('/Users/conradklek/webs/packages/webs-site/.webs/server/app/irc/index.js')],
  ['wrappers/app_[username]', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_[username].js')],
  ['wrappers/app_components_[component]', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_components_[component].js')],
  ['wrappers/app_index', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_index.js')],
  ['wrappers/app_signup', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_signup.js')],
  ['wrappers/app_login', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_login.js')],
  ['wrappers/app_irc_index', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_irc_index.js')],
  ['wrappers/app_irc_[channel]', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_irc_[channel].js')],
  ['wrappers/app_components_index', () => import('/Users/conradklek/webs/packages/webs-site/.webs/wrappers/app_components_index.js')]
]);

hydrate(componentLoaders, dbConfig);
