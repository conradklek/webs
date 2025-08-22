import migration1 from './migrations/0001_initial_auth.js';
import migration2 from './migrations/0002_seed_user.js';

export default {
  name: "app.db",
  migrations: [
    migration1,
    migration2,
  ],
};
