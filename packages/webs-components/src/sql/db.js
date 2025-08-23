import migration1 from "./migrations/0001_initial_auth.js";
import migration2 from "./migrations/0002_seed_user.js";
import migration3 from "./migrations/0003_ai_tables.js";
import migration4 from "./migrations/0004_create_todos_table.js";

export default {
  name: "app.db",
  migrations: [migration1, migration2, migration3, migration4],
};
