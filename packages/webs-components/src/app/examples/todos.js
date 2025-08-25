import {
  useQuery,
  useMutate,
  localDB,
  useState,
  onBeforeMount,
} from '@conradklek/webs';

function useAuth(to, __from, next) {
  if (!to.user) {
    next('/login');
  } else {
    next();
  }
}

export const middleware = [useAuth];

export default {
  name: 'Todos',
  props: {
    user: { type: Object, default: () => null },
    db: { type: Object, default: () => null },
    initialState: { type: Object, default: () => ({}) },
  },
  setup(props) {
    const newTodo = useState('');

    const todos = useQuery('todos', props.initialState?.todos?.data);

    const todoMutations = useMutate('todos');

    onBeforeMount(async () => {
      const localTodos = await localDB.getAll('todos');
      const serverTodos = props.initialState?.todos?.data;

      if (localTodos.length === 0 && serverTodos && serverTodos.length > 0) {
        console.log('[Todo] Local DB is empty, hydrating from server state...');
        // Use the more efficient bulk operation.
        await localDB.putAll('todos', serverTodos);
      }
    });

    function addTodo() {
      if (!newTodo.value.trim() || !props.user) return;
      const newTodoData = {
        id: crypto.randomUUID(),
        content: newTodo.value,
        completed: 0,
        user_id: props.user.id,
      };
      todoMutations.mutate(newTodoData);
      newTodo.value = '';
    }

    function toggleTodo(todo) {
      const updatedTodo = { ...todo, completed: todo.completed ? 0 : 1 };
      todoMutations.mutate(updatedTodo);
    }

    function deleteTodo(id) {
      todoMutations.destroy(id);
    }

    return {
      newTodo,
      todos,
      addTodo,
      toggleTodo,
      deleteTodo,
      user: props.user,
    };
  },

  template(html) {
    return html`
      <div class="w-full max-w-xl mx-auto p-4 flex flex-col gap-4">
        <h1 class="w-full text-lg font-medium text-center">
          @{{user?.username}}'s todos
        </h1>
        <div>
          <form @submit.prevent="addTodo" class="flex gap-2 mb-4 px-4 py-2">
            <input
              w-model="newTodo"
              type="text"
              placeholder="What needs to be done?"
              class="input flex-1"
            />
            <button type="submit" class="btn btn-default btn-size-lg">
              Add
            </button>
          </form>
          <ul class="px-4 space-y-1">
            <li
              w-for="todo in todos.data"
              :key="todo.id"
              class="group-todo flex items-center gap-3"
            >
              <input
                name="completed"
                type="checkbox"
                :checked="todo.completed"
                @change="toggleTodo(todo)"
              />
              <span
                :class="todo.completed && 'text-muted-foreground line-through'"
                >{{todo.content}}</span
              >
              <button
                @click="deleteTodo(todo.id)"
                class="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Delete todo"
              >
                Remove
              </button>
            </li>
          </ul>
        </div>
      </div>
    `;
  },
};
