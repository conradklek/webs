import { useQuery, useMutate, localDB } from "@conradklek/webs/client";

export default {
  name: "Todos",
  props: {
    user: {
      type: Object,
      default: () => null,
    },
    initialState: {
      type: Object,
      default: () => ({ initialTodos: [] }),
    },
  },

  state() {
    return {
      newTodo: "",
    };
  },

  onMounted() {
    console.log("[CLIENT] Populating local DB with initial todos.");
    try {
      this.initialState.initialTodos.forEach((todo) => localDB.put("todos", todo));
      console.log("[CLIENT] Local DB populated successfully.");
    } catch (e) {
      console.error("[CLIENT] Error populating local DB:", e);
      throw e;
    }
  },

  setup({ initialState }) {
    if (typeof window !== "undefined") {
      localDB.deleteAll("todos");
    }

    const todosQuery = useQuery("todos");
    const todosMutation = useMutate("todos");

    return {
      todosQuery,
      todosMutation,
      initialState,
    };
  },
  methods: {
    addTodo() {
      const content = this.newTodo.trim();
      if (!content || !this.todosMutation || !this.user) {
        console.warn(
          "[Todos Component] Add todo aborted: no content, mutation hook, or user available.",
        );
        return;
      }

      const newTodo = {
        id: crypto.randomUUID(),
        content,
        completed: 0,
        user_id: this.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.todosMutation.mutate(newTodo);
      this.newTodo = "";
    },
    toggleTodo(todo) {
      if (!this.todosMutation) {
        console.warn(
          "[Todos Component] Toggle todo aborted: mutation hook not available.",
        );
        return;
      }

      const updatedTodo = {
        ...todo,
        completed: todo.completed ? 0 : 1,
        updated_at: new Date().toISOString(),
      };

      this.todosMutation.mutate(updatedTodo);
    },
    deleteTodo(id) {
      if (!this.todosMutation) {
        console.warn(
          "[Todos Component] Delete todo aborted: mutation hook not available.",
        );
        return;
      }

      this.todosMutation.destroy(id);
    },
  },
  actions: {
    async upsertTodo(context, todo) {
      console.log("[SERVER ACTION] Syncing todo to server:", todo);
      const { db, user } = context;
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO todos (id, user_id, content, completed, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      stmt.run(
        todo.id,
        user.id,
        todo.content,
        todo.completed,
        todo.created_at,
        todo.updated_at,
      );
      console.log("[SERVER ACTION] Todo upserted successfully.");
      return { success: true };
    },
    async deleteTodo(context, id) {
      console.log("[SERVER ACTION] Deleting todo from server with ID:", id);
      const { db, user } = context;
      const stmt = db.prepare(`DELETE FROM todos WHERE id = ? AND user_id = ?`);
      stmt.run(id, user.id);
      console.log("[SERVER ACTION] Todo deleted successfully.");
      return { success: true };
    },
    async getTodos(context) {
      console.log("[SERVER ACTION] Fetching todos from server.");
      const { db, user } = context;
      const stmt = db.prepare(`SELECT * FROM todos WHERE user_id = ?`);
      const todos = stmt.all(user.id);
      console.log("[SERVER ACTION] Todos fetched successfully.");
      return todos;
    },
  },
  template(html) {
    return html`
      <div class="w-full max-w-xl mx-auto p-4">
        <h1 class="text-2xl font-bold mb-4">Local-First Todos</h1>
        <form @submit.prevent="addTodo" class="flex gap-2 mb-4">
          <input
            w-model="newTodo"
            type="text"
            placeholder="What needs to be done?"
            class="input flex-1"
          />
          <button type="submit" class="btn btn-primary">Add</button>
        </form>
        <ul class="space-y-2">
          <li
            w-for="todo in todosQuery.data"
            :key="todo.id"
            class="flex items-center gap-3 p-2 rounded-lg bg-muted"
          >
            <input
              type="checkbox"
              :checked="todo.completed"
              @change="toggleTodo(todo)"
              class="h-5 w-5"
            />
            <span>{{ todo.content }}</span>
            <button
              @click="deleteTodo(todo.id)"
              class="ml-auto text-red-500 hover:text-red-700"
            >
              &times;
            </button>
          </li>
        </ul>
      </div>
    `;
  },
};

