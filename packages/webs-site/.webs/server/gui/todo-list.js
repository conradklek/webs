// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/todo-list.webs
import {
  state,
  session,
  resource,
  onReady,
  computed
} from "@conradklek/webs";
var todo_list_default = {
  template: `
  <div class="w-full flex-1 flex flex-col items-start justify-start gap-4">
    <form @submit.prevent="addTodo" class="w-full mb-2 flex gap-2">
      <input
        bind:value="newTodo"
        type="text"
        placeholder="What needs to be done?"
        class="input"
      />
      <button type="submit" class="btn btn-default btn-size-lg">Add</button>
    </form>
    <div class="w-full">
      <ul class="w-full">
        <!-- We now loop over the 'sortedTodos' computed property -->
        <li
          w-for="todo in sortedTodos"
          :key="todo.id"
          class="w-full flex flex-row items-center gap-3"
        >
          <input
            :id="'todo-' + todo.id"
            type="checkbox"
            :checked="todo.completed"
            @change="toggleTodo(todo)"
            class="block size-4 rounded border border-border"
          />
          <label
            :for="'todo-' + todo.id"
            :class="{ 'line-through text-muted-foreground': todo.completed }"
          >
            {{ todo.content }}
          </label>
          <button
            @click="deleteTodo(todo.id)"
            class="shrink-0 whitespce-nowrap ml-auto flex items-center justify-center text-muted-foreground"
            aria-label="Delete todo"
          >
            Remove
          </button>
        </li>
      </ul>
    </div>
  </div>
`,
  style: ``,
  name: "todo-list",
  props: {
    initialState: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const newTodo = state("");
    const todosResource = resource("todos", props.initialState?.initialTodos || []);
    const sortedTodos = computed(() => {
      return (todosResource.state.data || []).slice().sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
      });
    });
    function addTodo() {
      const content = newTodo.value.trim();
      if (!content || !session.user?.id)
        return;
      const newTodoItem = {
        id: crypto.randomUUID(),
        content,
        completed: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: session.user.id
      };
      todosResource.put(newTodoItem);
      newTodo.value = "";
    }
    function toggleTodo(todo) {
      const updatedTodo = {
        ...todo,
        completed: todo.completed ? 0 : 1,
        updated_at: new Date().toISOString()
      };
      todosResource.put(updatedTodo);
    }
    function deleteTodo(id) {
      todosResource.destroy(id);
    }
    onReady(() => {
      todosResource.hydrate(props.initialState?.initialTodos);
    });
    return {
      newTodo,
      todos: todosResource.state,
      sortedTodos,
      addTodo,
      toggleTodo,
      deleteTodo
    };
  }
};
export {
  todo_list_default as default
};
