// @bun
// .webs/prebuild/gui/card-demo.js
var CardContent = {
  name: "card-content",
  template(html) {
    return html`
        <div class="p-6 pt-0">
          <slot></slot>
        </div>
      `;
  }
};
var CardDescription = {
  name: "card-description",
  template(html) {
    return html`
        <p class="text-sm text-muted-foreground">
          <slot></slot>
        </p>
      `;
  }
};
var CardFooter = {
  name: "card-footer",
  template(html) {
    return html`
        <div class="flex items-center p-6 pt-0">
          <slot></slot>
        </div>
      `;
  }
};
var CardHeader = {
  name: "card-header",
  template(html) {
    return html`
        <div class="flex flex-col space-y-1.5 p-6">
          <slot></slot>
        </div>
      `;
  }
};
var CardTitle = {
  name: "card-title",
  template(html) {
    return html`
        <h3 class="text-lg font-medium leading-none">
          <slot></slot>
        </h3>
      `;
  }
};
var card_default = {
  name: "card",
  template: "",
  style: "",
  name: "card",
  components: {
    "card-header": CardHeader,
    "card-title": CardTitle,
    "card-description": CardDescription,
    "card-content": CardContent,
    "card-footer": CardFooter
  },
  template(html) {
    return html`
        <div
          class="rounded-lg border border-border bg-card text-card-foreground"
        >
          <slot></slot>
        </div>
      `;
  }
};
var card_demo_default = {
  name: "card-demo",
  template: `<card class="w-[350px]">
    <card-header>
      <card-title>Create project</card-title>
      <card-description>Deploy your new project in one-click.</card-description>
    </card-header>
    <card-content>
      <p>Card Content goes here.</p>
    </card-content>
    <card-footer>
      <button type="button" class="btn btn-default btn-size-lg w-full">
        Submit
      </button>
    </card-footer>
  </card>`,
  style: "",
  components: {
    card: card_default,
    ...card_default.components
  }
};

// .webs/prebuild/gui/menubar-demo.js
import { provide, inject, state } from "@conradklek/webs";
var MenubarMenu = {
  name: "menubar-menu",
  props: { value: { type: String, required: true } },
  setup(props) {
    provide("menuValue", props.value);
  },
  template(html) {
    return html`<div class="relative"><slot></slot></div>`;
  }
};
var MenubarTrigger = {
  name: "menubar-trigger",
  setup() {
    const menubar = inject("menubar");
    const menuValue = inject("menuValue");
    return { menubar, menuValue };
  },
  template(html) {
    return html`
        <button
          type="button"
          @click="menubar.toggleMenu(menuValue)"
          :data-state="menubar && menubar.is_open(menuValue) ? 'open' : 'closed'"
          class="flex cursor-default select-none items-center rounded-sm px-3 py-1.5 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <slot></slot>
        </button>
      `;
  }
};
var MenubarContent = {
  name: "menubar-content",
  setup() {
    const menubar = inject("menubar");
    const menuValue = inject("menuValue");
    return { menubar, menuValue };
  },
  template(html) {
    return html`
        {#if menubar && menubar.is_open(menuValue)}
        <div
          class="absolute z-50 min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md top-full translate-y-2 origin-top"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var MenubarItem = {
  name: "menubar-item",
  setup() {
    const menubar = inject("menubar");
    return { menubar };
  },
  template(html) {
    return html`
        <div
          @click="menubar.closeMenu()"
          class="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
          <slot></slot>
        </div>
      `;
  }
};
var MenubarSub = {
  name: "menubar-sub",
  setup() {
    const isOpen = state(false);
    let closeTimer = null;
    function open() {
      clearTimeout(closeTimer);
      isOpen.value = true;
    }
    function close() {
      closeTimer = setTimeout(() => {
        isOpen.value = false;
      }, 100);
    }
    function is_open() {
      return isOpen.value;
    }
    provide("submenu", { open, close, is_open });
    return { open, close };
  },
  template(html) {
    return html`<div class="relative" @mouseenter="open" @mouseleave="close">
        <slot></slot>
      </div>`;
  }
};
var MenubarSubTrigger = {
  name: "menubar-subtrigger",
  setup() {
    const submenu = inject("submenu");
    return { submenu };
  },
  template(html) {
    return html`
        <div
          :data-state="submenu && submenu.is_open() ? 'open' : 'closed'"
          class="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <span class="flex-1"><slot></slot></span>
        </div>
      `;
  }
};
var MenubarSubContent = {
  name: "menubar-subcontent",
  setup() {
    const submenu = inject("submenu");
    return { submenu };
  },
  template(html) {
    return html`
        {#if submenu && submenu.is_open()}
        <div
          class="absolute z-50 min-w-[8rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md left-full -top-2"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var MenubarSeparator = {
  name: "menubar-separator",
  template(html) {
    return html`<div class="-mx-1 my-1 h-px bg-muted"></div>`;
  }
};
var MenubarShortcut = {
  name: "menubar-shortcut",
  template(html) {
    return html`<span
        class="ml-auto text-xs tracking-widest text-muted-foreground"
        ><slot></slot
      ></span>`;
  }
};
var MenubarLabel = {
  name: "menubar-label",
  template(html) {
    return html`<div class="px-2 py-1.5 text-sm font-semibold">
        <slot></slot>
      </div>`;
  }
};
var MenubarGroup = {
  name: "menubar-group",
  template(html) {
    return html`<div><slot></slot></div>`;
  }
};
var menubar_default = {
  name: "menubar",
  template: "",
  style: "",
  name: "menubar",
  components: {
    "menubar-menu": MenubarMenu,
    "menubar-trigger": MenubarTrigger,
    "menubar-content": MenubarContent,
    "menubar-item": MenubarItem,
    "menubar-separator": MenubarSeparator,
    "menubar-shortcut": MenubarShortcut,
    "menubar-label": MenubarLabel,
    "menubar-group": MenubarGroup,
    "menubar-sub": MenubarSub,
    "menubar-subtrigger": MenubarSubTrigger,
    "menubar-subcontent": MenubarSubContent
  },
  setup() {
    const activeMenu = state(null);
    function openMenu(value) {
      activeMenu.value = value;
    }
    function closeMenu() {
      activeMenu.value = null;
    }
    function toggleMenu(value) {
      activeMenu.value = activeMenu.value === value ? null : value;
    }
    function is_open(value) {
      return activeMenu.value === value;
    }
    provide("menubar", { openMenu, closeMenu, toggleMenu, is_open });
  },
  template(html) {
    return html`
        <div
          class="flex h-10 items-center space-x-1 border border-border rounded-md bg-popover p-1"
        >
          <slot></slot>
        </div>
      `;
  }
};
var menubar_demo_default = {
  name: "menubar-demo",
  template: `<menubar>
    <menubar-menu value="file">
      <menubar-trigger>File</menubar-trigger>
      <menubar-content>
        <menubar-item>
          New Tab <menubar-shortcut>\u2318T</menubar-shortcut>
        </menubar-item>
        <menubar-item>
          New Window <menubar-shortcut>\u2318N</menubar-shortcut>
        </menubar-item>
        <menubar-item disabled>New Incognito Window</menubar-item>
        <menubar-separator />
        <menubar-sub>
          <menubar-subtrigger>Share</menubar-subtrigger>
          <menubar-subcontent>
            <menubar-item>Email Link</menubar-item>
            <menubar-item>Messages</menubar-item>
            <menubar-item>Notes</menubar-item>
          </menubar-subcontent>
        </menubar-sub>
        <menubar-separator />
        <menubar-item>
          Print... <menubar-shortcut>\u2318P</menubar-shortcut>
        </menubar-item>
      </menubar-content>
    </menubar-menu>
    <menubar-menu value="edit">
      <menubar-trigger>Edit</menubar-trigger>
      <menubar-content>
        <menubar-item>
          Undo <menubar-shortcut>\u2318Z</menubar-shortcut>
        </menubar-item>
        <menubar-item>
          Redo <menubar-shortcut>\u21E7\u2318Z</menubar-shortcut>
        </menubar-item>
        <menubar-separator />
        <menubar-sub>
          <menubar-subtrigger>Find</menubar-subtrigger>
          <menubar-subcontent>
            <menubar-item>Search...</menubar-item>
            <menubar-separator />
            <menubar-item>Find...</menubar-item>
            <menubar-item>Find Next</menubar-item>
            <menubar-item>Find Previous</menubar-item>
          </menubar-subcontent>
        </menubar-sub>
        <menubar-separator />
        <menubar-item>Cut</menubar-item>
        <menubar-item>Copy</menubar-item>
        <menubar-item>Paste</menubar-item>
      </menubar-content>
    </menubar-menu>
  </menubar>`,
  style: "",
  components: {
    menubar: menubar_default,
    ...menubar_default.components
  }
};

// .webs/prebuild/gui/tabs-demo.js
import { provide as provide2, inject as inject2, state as state2, computed } from "@conradklek/webs";
var TabsContent = {
  name: "tabs-content",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab } = inject2("tabs");
    const isActive = computed(() => activeTab.value === props.value);
    return { isActive };
  },
  template(html) {
    return html`
        {#if isActive}
        <div
          class="w-full mt-2 p-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var TabsTrigger = {
  name: "tabs-trigger",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab, activateTab } = inject2("tabs");
    const isActive = computed(() => activeTab.value === props.value);
    const handleClick = () => activateTab(props.value);
    return { isActive, handleClick };
  },
  template(html) {
    return html`
        <button
          type="button"
          @click="handleClick"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-popover data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          :data-state="isActive ? 'active' : 'inactive'"
        >
          <slot></slot>
        </button>
      `;
  }
};
var TabsList = {
  name: "tabs-list",
  template(html) {
    return html`<div
        class="inline-flex w-full h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground"
      >
        <slot></slot>
      </div>`;
  }
};
var tabs_default = {
  name: "tabs",
  template: "",
  style: "",
  name: "tabs",
  components: {
    "tabs-list": TabsList,
    "tabs-trigger": TabsTrigger,
    "tabs-content": TabsContent
  },
  props: {
    defaultValue: { type: String, required: true }
  },
  setup(props) {
    const activeTab = state2(props.defaultValue);
    function activateTab(value) {
      activeTab.value = value;
    }
    provide2("tabs", { activeTab, activateTab });
  },
  template: (html) => html`<div class="w-full flex flex-col"><slot></slot></div>`
};
var tabs_demo_default = {
  name: "tabs-demo",
  template: `<tabs defaultValue="account">
    <tabs-list>
      <tabs-trigger value="account">Account</tabs-trigger>
      <tabs-trigger value="password">Password</tabs-trigger>
    </tabs-list>
    <tabs-content value="account">
      Make changes to your account here. Click save when you're done.
    </tabs-content>
    <tabs-content value="password">
      Change your password here. After saving, you'll be logged out.
    </tabs-content>
  </tabs>`,
  style: "",
  components: {
    tabs: tabs_default,
    ...tabs_default.components
  }
};

// .webs/prebuild/gui/breadcrumb.js
var BreadcrumbList = {
  template(html) {
    return html`
        <ol class="flex flex-wrap items-center gap-1.5 break-words sm:gap-2.5">
          <slot></slot>
        </ol>
      `;
  }
};
var BreadcrumbItem = {
  template(html) {
    return html`
        <li class="inline-flex items-center gap-1.5">
          <slot></slot>
        </li>
      `;
  }
};
var BreadcrumbLink = {
  template(html) {
    return html`
        <a class="text-hyperlink underline hover:opacity-75 active:opacity-50">
          <slot></slot>
        </a>
      `;
  }
};
var BreadcrumbActive = {
  template(html) {
    return html`
        <span
          role="link"
          aria-disabled="true"
          aria-current="page"
          class="font-normal text-foreground"
        >
          <slot></slot>
        </span>
      `;
  }
};
var BreadcrumbSeparator = {
  template(html) {
    return html`
        <li role="presentation" aria-hidden="true" class="text-system">/</li>
      `;
  }
};
var BreadcrumbEllipsis = {
  template(html) {
    return html`
        <span
          role="presentation"
          aria-hidden="true"
          class="flex size-8 items-center justify-center"
        >
          ...
        </span>
      `;
  }
};
var breadcrumb_default = {
  name: "breadcrumb",
  template: "",
  style: "",
  components: {
    "breadcrumb-list": BreadcrumbList,
    "breadcrumb-item": BreadcrumbItem,
    "breadcrumb-link": BreadcrumbLink,
    "breadcrumb-active": BreadcrumbActive,
    "breadcrumb-separator": BreadcrumbSeparator,
    "breadcrumb-ellipsis": BreadcrumbEllipsis
  },
  template(html) {
    return html`<nav aria-label="breadcrumb">
        <slot></slot>
      </nav>`;
  }
};

// .webs/prebuild/gui/todo-list.js
import {
  state as state3,
  session,
  useTable,
  onReady,
  computed as computed2
} from "@conradklek/webs";
var todo_list_default = {
  name: "todo-list",
  template: `<div
    class="w-full max-w-lg mx-auto flex-1 flex flex-col items-start justify-start gap-4"
  >
    <form @submit.prevent="createTodo" class="w-full mb-2 flex gap-2">
      <input
        bind:value="newTodoContent"
        type="text"
        placeholder="What needs to be done?"
        class="input"
      />
      <button type="submit" class="btn btn-default btn-size-lg">Add</button>
    </form>
    <div class="w-full">
      <ul class="w-full space-y-2">
        {#each sortedTodos as todo (todo.id)}
        <li
          class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100"
        >
          <input
            :id="'todo-' + todo.id"
            type="checkbox"
            :checked="todo.completed"
            @change="toggleTodo(todo)"
            class="block size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            :for="'todo-' + todo.id"
            :data-completed="todo.completed"
            class="flex-grow data-[completed=true]:line-through data-[completed=true]:text-muted-foreground"
          >
            {{ todo.content }}
          </label>
          <button
            @click="deleteTodo(todo.id)"
            class="shrink-0 text-sm text-red-500 hover:text-red-700"
            aria-label="Delete todo"
          >
            Remove
          </button>
        </li>
        {/each}
      </ul>
    </div>
  </div>`,
  style: "",
  tables: {
    todos: {
      sync: true,
      keyPath: "id",
      fields: {
        id: { type: "text", primaryKey: true },
        user_id: {
          type: "integer",
          notNull: true,
          references: "users(id)",
          onDelete: "CASCADE"
        },
        content: { type: "text", notNull: true },
        completed: { type: "boolean", default: 0 },
        created_at: { type: "timestamp", default: "CURRENT_TIMESTAMP" },
        updated_at: { type: "timestamp", default: "CURRENT_TIMESTAMP" }
      },
      indexes: [{ name: "by_completed", keyPath: "completed" }]
    }
  },
  props: {
    initialState: Object
  },
  setup(props) {
    const newTodoContent = state3("");
    const todos = useTable("todos", props.initialState?.initialTodos);
    const sortedTodos = computed2(() => [...todos.data || []].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    function createTodo() {
      const content = newTodoContent.value.trim();
      if (!content || !session.user?.id)
        return;
      todos.put({
        id: crypto.randomUUID(),
        content,
        completed: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: session.user.id
      });
      newTodoContent.value = "";
    }
    function toggleTodo(todo) {
      todos.put({
        ...todo,
        completed: todo.completed ? 0 : 1,
        updated_at: new Date().toISOString()
      });
    }
    onReady(() => {
      todos.hydrate(props.initialState?.initialTodos);
    });
    return {
      newTodoContent,
      todos,
      sortedTodos,
      createTodo,
      toggleTodo,
      deleteTodo: todos.destroy
    };
  }
};

// .webs/prebuild/gui/menubar.js
import { provide as provide3, inject as inject3, state as state4 } from "@conradklek/webs";
var MenubarMenu2 = {
  name: "menubar-menu",
  props: { value: { type: String, required: true } },
  setup(props) {
    provide3("menuValue", props.value);
  },
  template(html) {
    return html`<div class="relative"><slot></slot></div>`;
  }
};
var MenubarTrigger2 = {
  name: "menubar-trigger",
  setup() {
    const menubar = inject3("menubar");
    const menuValue = inject3("menuValue");
    return { menubar, menuValue };
  },
  template(html) {
    return html`
        <button
          type="button"
          @click="menubar.toggleMenu(menuValue)"
          :data-state="menubar && menubar.is_open(menuValue) ? 'open' : 'closed'"
          class="flex cursor-default select-none items-center rounded-sm px-3 py-1.5 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <slot></slot>
        </button>
      `;
  }
};
var MenubarContent2 = {
  name: "menubar-content",
  setup() {
    const menubar = inject3("menubar");
    const menuValue = inject3("menuValue");
    return { menubar, menuValue };
  },
  template(html) {
    return html`
        {#if menubar && menubar.is_open(menuValue)}
        <div
          class="absolute z-50 min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md top-full translate-y-2 origin-top"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var MenubarItem2 = {
  name: "menubar-item",
  setup() {
    const menubar = inject3("menubar");
    return { menubar };
  },
  template(html) {
    return html`
        <div
          @click="menubar.closeMenu()"
          class="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
          <slot></slot>
        </div>
      `;
  }
};
var MenubarSub2 = {
  name: "menubar-sub",
  setup() {
    const isOpen = state4(false);
    let closeTimer = null;
    function open() {
      clearTimeout(closeTimer);
      isOpen.value = true;
    }
    function close() {
      closeTimer = setTimeout(() => {
        isOpen.value = false;
      }, 100);
    }
    function is_open() {
      return isOpen.value;
    }
    provide3("submenu", { open, close, is_open });
    return { open, close };
  },
  template(html) {
    return html`<div class="relative" @mouseenter="open" @mouseleave="close">
        <slot></slot>
      </div>`;
  }
};
var MenubarSubTrigger2 = {
  name: "menubar-subtrigger",
  setup() {
    const submenu = inject3("submenu");
    return { submenu };
  },
  template(html) {
    return html`
        <div
          :data-state="submenu && submenu.is_open() ? 'open' : 'closed'"
          class="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <span class="flex-1"><slot></slot></span>
        </div>
      `;
  }
};
var MenubarSubContent2 = {
  name: "menubar-subcontent",
  setup() {
    const submenu = inject3("submenu");
    return { submenu };
  },
  template(html) {
    return html`
        {#if submenu && submenu.is_open()}
        <div
          class="absolute z-50 min-w-[8rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md left-full -top-2"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var MenubarSeparator2 = {
  name: "menubar-separator",
  template(html) {
    return html`<div class="-mx-1 my-1 h-px bg-muted"></div>`;
  }
};
var MenubarShortcut2 = {
  name: "menubar-shortcut",
  template(html) {
    return html`<span
        class="ml-auto text-xs tracking-widest text-muted-foreground"
        ><slot></slot
      ></span>`;
  }
};
var MenubarLabel2 = {
  name: "menubar-label",
  template(html) {
    return html`<div class="px-2 py-1.5 text-sm font-semibold">
        <slot></slot>
      </div>`;
  }
};
var MenubarGroup2 = {
  name: "menubar-group",
  template(html) {
    return html`<div><slot></slot></div>`;
  }
};
var menubar_default2 = {
  name: "menubar",
  template: "",
  style: "",
  name: "menubar",
  components: {
    "menubar-menu": MenubarMenu2,
    "menubar-trigger": MenubarTrigger2,
    "menubar-content": MenubarContent2,
    "menubar-item": MenubarItem2,
    "menubar-separator": MenubarSeparator2,
    "menubar-shortcut": MenubarShortcut2,
    "menubar-label": MenubarLabel2,
    "menubar-group": MenubarGroup2,
    "menubar-sub": MenubarSub2,
    "menubar-subtrigger": MenubarSubTrigger2,
    "menubar-subcontent": MenubarSubContent2
  },
  setup() {
    const activeMenu = state4(null);
    function openMenu(value) {
      activeMenu.value = value;
    }
    function closeMenu() {
      activeMenu.value = null;
    }
    function toggleMenu(value) {
      activeMenu.value = activeMenu.value === value ? null : value;
    }
    function is_open(value) {
      return activeMenu.value === value;
    }
    provide3("menubar", { openMenu, closeMenu, toggleMenu, is_open });
  },
  template(html) {
    return html`
        <div
          class="flex h-10 items-center space-x-1 border border-border rounded-md bg-popover p-1"
        >
          <slot></slot>
        </div>
      `;
  }
};

// .webs/prebuild/gui/modal-demo.js
import { provide as provide4, inject as inject4, state as state5 } from "@conradklek/webs";
var ModalTrigger = {
  name: "modal-trigger",
  setup() {
    const modal = inject4("modal");
    return { modal };
  },
  template(html) {
    return html`<button type="button" @click="modal.open()">
        <slot></slot>
      </button>`;
  }
};
var ModalClose = {
  name: "modal-close",
  setup() {
    const modal = inject4("modal");
    return { modal };
  },
  template(html) {
    return html`<button @click="modal.close()"><slot></slot></button>`;
  }
};
var ModalContent = {
  name: "modal-content",
  setup() {
    const modal = inject4("modal");
    return { modal };
  },
  template(html) {
    return html`
        {#if modal && modal.isOpen()}
        <div
          class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-md rounded-lg"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var ModalHeader = {
  name: "modal-header",
  template(html) {
    return html`<div class="flex flex-col space-y-1.5 text-left">
        <slot></slot>
      </div>`;
  }
};
var ModalFooter = {
  name: "modal-footer",
  template(html) {
    return html`<div
        class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
      >
        <slot></slot>
      </div>`;
  }
};
var ModalTitle = {
  name: "modal-title",
  template(html) {
    return html`<h2 class="text-lg font-medium leading-none">
        <slot></slot>
      </h2>`;
  }
};
var ModalDescription = {
  name: "modal-description",
  template(html) {
    return html`<p class="text-muted-foreground text-pretty">
        <slot></slot>
      </p>`;
  }
};
var modal_default = {
  name: "modal",
  template: "",
  style: "",
  name: "modal",
  components: {
    "modal-trigger": ModalTrigger,
    "modal-content": ModalContent,
    "modal-header": ModalHeader,
    "modal-footer": ModalFooter,
    "modal-title": ModalTitle,
    "modal-description": ModalDescription,
    "modal-close": ModalClose
  },
  setup() {
    const opened = state5(false);
    function open() {
      opened.value = true;
    }
    function close() {
      opened.value = false;
    }
    function isOpen() {
      return opened.value;
    }
    provide4("modal", { open, close, isOpen });
  },
  template(html) {
    return html`<div><slot></slot></div>`;
  }
};
var modal_demo_default = {
  name: "modal-demo",
  template: `<modal>
    <modal-trigger>
      <button type="button" class="btn btn-default btn-size-lg">
        Open Modal
      </button>
    </modal-trigger>
    <modal-content>
      <modal-header>
        <modal-title>Edit Profile</modal-title>
        <modal-description>
          Make changes to your profile here. Click save when you're done.
        </modal-description>
      </modal-header>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <label for="name" class="text-right"> Name </label>
          <input id="name" value="Conrad Klek" class="input col-span-3" />
        </div>
        <div class="grid grid-cols-4 items-center gap-4">
          <label for="username" class="text-right"> Username </label>
          <input id="username" value="@conradklek" class="input col-span-3" />
        </div>
      </div>
      <modal-footer>
        <modal-close>
          <button type="button" class="btn btn-default btn-size-lg w-full">
            Save changes
          </button>
        </modal-close>
      </modal-footer>
    </modal-content>
  </modal>`,
  style: "",
  components: {
    modal: modal_default,
    ...modal_default.components
  }
};

// .webs/prebuild/gui/tabs.js
import { provide as provide5, inject as inject5, state as state6, computed as computed3 } from "@conradklek/webs";
var TabsContent2 = {
  name: "tabs-content",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab } = inject5("tabs");
    const isActive = computed3(() => activeTab.value === props.value);
    return { isActive };
  },
  template(html) {
    return html`
        {#if isActive}
        <div
          class="w-full mt-2 p-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var TabsTrigger2 = {
  name: "tabs-trigger",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab, activateTab } = inject5("tabs");
    const isActive = computed3(() => activeTab.value === props.value);
    const handleClick = () => activateTab(props.value);
    return { isActive, handleClick };
  },
  template(html) {
    return html`
        <button
          type="button"
          @click="handleClick"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-popover data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          :data-state="isActive ? 'active' : 'inactive'"
        >
          <slot></slot>
        </button>
      `;
  }
};
var TabsList2 = {
  name: "tabs-list",
  template(html) {
    return html`<div
        class="inline-flex w-full h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground"
      >
        <slot></slot>
      </div>`;
  }
};
var tabs_default2 = {
  name: "tabs",
  template: "",
  style: "",
  name: "tabs",
  components: {
    "tabs-list": TabsList2,
    "tabs-trigger": TabsTrigger2,
    "tabs-content": TabsContent2
  },
  props: {
    defaultValue: { type: String, required: true }
  },
  setup(props) {
    const activeTab = state6(props.defaultValue);
    function activateTab(value) {
      activeTab.value = value;
    }
    provide5("tabs", { activeTab, activateTab });
  },
  template: (html) => html`<div class="w-full flex flex-col"><slot></slot></div>`
};

// .webs/prebuild/gui/breadcrumb-demo.js
var BreadcrumbList2 = {
  template(html) {
    return html`
        <ol class="flex flex-wrap items-center gap-1.5 break-words sm:gap-2.5">
          <slot></slot>
        </ol>
      `;
  }
};
var BreadcrumbItem2 = {
  template(html) {
    return html`
        <li class="inline-flex items-center gap-1.5">
          <slot></slot>
        </li>
      `;
  }
};
var BreadcrumbLink2 = {
  template(html) {
    return html`
        <a class="text-hyperlink underline hover:opacity-75 active:opacity-50">
          <slot></slot>
        </a>
      `;
  }
};
var BreadcrumbActive2 = {
  template(html) {
    return html`
        <span
          role="link"
          aria-disabled="true"
          aria-current="page"
          class="font-normal text-foreground"
        >
          <slot></slot>
        </span>
      `;
  }
};
var BreadcrumbSeparator2 = {
  template(html) {
    return html`
        <li role="presentation" aria-hidden="true" class="text-system">/</li>
      `;
  }
};
var BreadcrumbEllipsis2 = {
  template(html) {
    return html`
        <span
          role="presentation"
          aria-hidden="true"
          class="flex size-8 items-center justify-center"
        >
          ...
        </span>
      `;
  }
};
var breadcrumb_default2 = {
  name: "breadcrumb",
  template: "",
  style: "",
  components: {
    "breadcrumb-list": BreadcrumbList2,
    "breadcrumb-item": BreadcrumbItem2,
    "breadcrumb-link": BreadcrumbLink2,
    "breadcrumb-active": BreadcrumbActive2,
    "breadcrumb-separator": BreadcrumbSeparator2,
    "breadcrumb-ellipsis": BreadcrumbEllipsis2
  },
  template(html) {
    return html`<nav aria-label="breadcrumb">
        <slot></slot>
      </nav>`;
  }
};
var breadcrumb_demo_default = {
  name: "breadcrumb-demo",
  template: `<breadcrumb>
    <breadcrumb-list>
      <breadcrumb-item>
        <breadcrumb-link href="/">Home</breadcrumb-link>
      </breadcrumb-item>
      <breadcrumb-separator />
      <breadcrumb-ellipsis>
        <breadcrumb-link href="/components">Products</breadcrumb-link>
      </breadcrumb-ellipsis>
      <breadcrumb-separator />
      <breadcrumb-item>
        <breadcrumb-active>Breadcrumb</breadcrumb-active>
      </breadcrumb-item>
    </breadcrumb-list>
  </breadcrumb>`,
  style: "",
  components: {
    breadcrumb: breadcrumb_default2,
    ...breadcrumb_default2.components
  }
};

// .webs/prebuild/gui/radio-group-demo.js
import { provide as provide6, inject as inject6, state as state7 } from "@conradklek/webs";
var RadioGroupItem = {
  name: "radio-group-item",
  props: {
    value: { type: String, required: true }
  },
  setup(props) {
    const radioGroup = inject6("radioGroup");
    return { radioGroup, value: props.value };
  },
  template(html) {
    return html`
        <button
          type="button"
          role="radio"
          :aria-checked="radioGroup.is_selected(value)"
          :data-state="radioGroup.is_selected(value) ? 'checked' : 'unchecked'"
          @click="radioGroup.select(value)"
          class="aspect-square h-4 w-4 rounded-full border border-border text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if radioGroup.is_selected(value)}
          <div class="flex items-center justify-center">
            <div class="h-2.5 w-2.5 rounded-full bg-current fill-current"></div>
          </div>
          {/if}
        </button>
      `;
  }
};
var radio_group_default = {
  name: "radio-group",
  template: "",
  style: "",
  name: "radio-group",
  components: { "radio-group-item": RadioGroupItem },
  props: {
    defaultValue: { type: String }
  },
  setup(props) {
    const selectedValue = state7(props.defaultValue);
    function select(value) {
      selectedValue.value = value;
    }
    function is_selected(value) {
      return selectedValue.value === value;
    }
    provide6("radioGroup", { select, is_selected });
  },
  template(html) {
    return html`
        <div role="radiogroup" class="flex flex-col gap-2">
          <slot></slot>
        </div>
      `;
  }
};
var radio_group_demo_default = {
  name: "radio-group-demo",
  template: `<radio-group defaultValue="comfortable">
    <div class="flex items-center space-x-2">
      <radio-group-item value="default" id="r1" />
      <label for="r1">Default</label>
    </div>
    <div class="flex items-center space-x-2">
      <radio-group-item value="comfortable" id="r2" />
      <label for="r2">Comfortable</label>
    </div>
    <div class="flex items-center space-x-2">
      <radio-group-item value="compact" id="r3" />
      <label for="r3">Compact</label>
    </div>
  </radio-group>`,
  style: "",
  components: {
    "radio-group": radio_group_default,
    ...radio_group_default.components
  }
};

// .webs/prebuild/gui/checkbox.js
import { state as state8 } from "@conradklek/webs";
var checkbox_default = {
  name: "checkbox",
  template: "",
  style: "",
  name: "checkbox",
  props: {
    defaultChecked: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const isChecked = state8(props.defaultChecked);
    function toggle() {
      isChecked.value = !isChecked.value;
    }
    return {
      isChecked,
      toggle
    };
  },
  template(html) {
    return html`
        <button
          type="button"
          role="checkbox"
          :aria-checked="isChecked"
          @click="toggle"
          :data-state="isChecked ? 'checked' : 'unchecked'"
          class="peer h-4 w-4 shrink-0 rounded-sm border border-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-muted data-[state=checked]:bg-blue-600 data-[state=checked]:border-transparent"
        ></button>
      `;
  }
};

// .webs/prebuild/gui/user-navbar.js
import { session as session2, route } from "@conradklek/webs";
var user_navbar_default = {
  name: "user-navbar",
  template: `<div class="flex-1">
    <div class="w-full flex flex-row items-center justify-end gap-4">
      {#if !session.isLoggedIn}
      <nav class="contents">
        <a
          :href="'/login'"
          class="link data-[open=true]:no-underline"
          :data-open="route.path === '/login'"
          >Login</a
        >
        <span>|</span>
        <a
          :href="'/signup'"
          class="link data-[open=true]:no-underline"
          :data-open="route.path === '/signup'"
          >Signup</a
        >
      </nav>
      {:else}
      <nav class="contents">
        <a :href="'/' + (params.username || session.user.username)" class="link"
          >@{{ params.username || session.user.username }}</a
        >
        <span>|</span>
        <button type="button" @click="handleLogout" class="link">Logout</button>
      </nav>
      {/if}
    </div>
  </div>`,
  style: "",
  props: {
    params: Object
  },
  setup(props) {
    function handleLogout() {
      session2.logout();
      window.location.href = "/";
    }
    return { session: session2, route, handleLogout, params: props.params };
  }
};

// .webs/prebuild/gui/accordion-demo.js
import { provide as provide7, inject as inject7, state as state9, computed as computed4 } from "@conradklek/webs";
var AccordionItem = {
  name: "accordion-item",
  props: {
    value: {
      type: String,
      required: true
    }
  },
  setup(props) {
    provide7("itemValue", props.value);
  },
  template: `
        <div class="w-full flex flex-col gap-1.5">
          <slot></slot>
        </div>
      `
};
var AccordionTrigger = {
  name: "accordion-trigger",
  setup() {
    const accordion = inject7("accordion");
    const { toggle } = accordion || {};
    const value = inject7("itemValue");
    return {
      handleClick: () => toggle && value && toggle(value)
    };
  },
  template: `
        <h3>
          <button
            type="button"
            @click="handleClick"
            class="w-full flex flex-row items-start justify-start cursor-pointer"
          >
            <span
              class="flex-1 flex flex-row items-start justify-start font-medium"
            >
              <slot></slot>
            </span>
          </button>
        </h3>
      `
};
var AccordionContent = {
  name: "accordion-content",
  setup() {
    const accordion = inject7("accordion");
    const { openItems } = accordion || {};
    const value = inject7("itemValue");
    const isOpen = computed4(() => openItems && openItems.has(value));
    return { isOpen };
  },
  template: `
        {#if isOpen}
        <div class="pb-3 pt-1">
          <slot></slot>
        </div>
        {/if}
      `
};
var accordion_default = {
  name: "accordion",
  template: "",
  style: "",
  name: "accordion",
  components: {
    "accordion-item": AccordionItem,
    "accordion-trigger": AccordionTrigger,
    "accordion-content": AccordionContent
  },
  props: {
    type: {
      type: String,
      default: "single"
    },
    collapsible: {
      type: Boolean,
      default: true
    }
  },
  setup(props) {
    const openItems = state9(new Set);
    function toggle(value) {
      const newSet = new Set(openItems);
      if (props.type === "single") {
        if (newSet.has(value)) {
          if (props.collapsible) {
            newSet.delete(value);
          }
        } else {
          newSet.clear();
          newSet.add(value);
        }
      } else if (props.type === "multiple") {
        if (newSet.has(value)) {
          newSet.delete(value);
        } else {
          newSet.add(value);
        }
      }
      openItems.clear();
      for (const item of newSet) {
        openItems.add(item);
      }
    }
    provide7("accordion", {
      openItems,
      toggle
    });
  },
  template: `
        <div class="w-full flex flex-col items-start justify-start gap-3">
          <slot></slot>
        </div>
      `
};
var accordion_demo_default = {
  name: "accordion-demo",
  template: `<accordion type="single" collapsible>
    <accordion-item value="item-1">
      <accordion-trigger>Is it accessible?</accordion-trigger>
      <accordion-content
        >Yes. It adheres to the WAI-ARIA design pattern.</accordion-content
      >
    </accordion-item>
    <accordion-item value="item-2">
      <accordion-trigger>Is it styled?</accordion-trigger>
      <accordion-content
        >Yes. It comes with default styles that matches the other
        components.</accordion-content
      >
    </accordion-item>
    <accordion-item value="item-3">
      <accordion-trigger>Is it animated?</accordion-trigger>
      <accordion-content
        >Yes. It's animated by default, but you can disable it if you
        prefer.</accordion-content
      >
    </accordion-item>
  </accordion>`,
  style: "",
  components: {
    accordion: accordion_default,
    ...accordion_default.components
  }
};

// .webs/prebuild/gui/card.js
var CardContent2 = {
  name: "card-content",
  template(html) {
    return html`
        <div class="p-6 pt-0">
          <slot></slot>
        </div>
      `;
  }
};
var CardDescription2 = {
  name: "card-description",
  template(html) {
    return html`
        <p class="text-sm text-muted-foreground">
          <slot></slot>
        </p>
      `;
  }
};
var CardFooter2 = {
  name: "card-footer",
  template(html) {
    return html`
        <div class="flex items-center p-6 pt-0">
          <slot></slot>
        </div>
      `;
  }
};
var CardHeader2 = {
  name: "card-header",
  template(html) {
    return html`
        <div class="flex flex-col space-y-1.5 p-6">
          <slot></slot>
        </div>
      `;
  }
};
var CardTitle2 = {
  name: "card-title",
  template(html) {
    return html`
        <h3 class="text-lg font-medium leading-none">
          <slot></slot>
        </h3>
      `;
  }
};
var card_default2 = {
  name: "card",
  template: "",
  style: "",
  name: "card",
  components: {
    "card-header": CardHeader2,
    "card-title": CardTitle2,
    "card-description": CardDescription2,
    "card-content": CardContent2,
    "card-footer": CardFooter2
  },
  template(html) {
    return html`
        <div
          class="rounded-lg border border-border bg-card text-card-foreground"
        >
          <slot></slot>
        </div>
      `;
  }
};

// .webs/prebuild/gui/modal.js
import { provide as provide8, inject as inject8, state as state10 } from "@conradklek/webs";
var ModalTrigger2 = {
  name: "modal-trigger",
  setup() {
    const modal = inject8("modal");
    return { modal };
  },
  template(html) {
    return html`<button type="button" @click="modal.open()">
        <slot></slot>
      </button>`;
  }
};
var ModalClose2 = {
  name: "modal-close",
  setup() {
    const modal = inject8("modal");
    return { modal };
  },
  template(html) {
    return html`<button @click="modal.close()"><slot></slot></button>`;
  }
};
var ModalContent2 = {
  name: "modal-content",
  setup() {
    const modal = inject8("modal");
    return { modal };
  },
  template(html) {
    return html`
        {#if modal && modal.isOpen()}
        <div
          class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-md rounded-lg"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var ModalHeader2 = {
  name: "modal-header",
  template(html) {
    return html`<div class="flex flex-col space-y-1.5 text-left">
        <slot></slot>
      </div>`;
  }
};
var ModalFooter2 = {
  name: "modal-footer",
  template(html) {
    return html`<div
        class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
      >
        <slot></slot>
      </div>`;
  }
};
var ModalTitle2 = {
  name: "modal-title",
  template(html) {
    return html`<h2 class="text-lg font-medium leading-none">
        <slot></slot>
      </h2>`;
  }
};
var ModalDescription2 = {
  name: "modal-description",
  template(html) {
    return html`<p class="text-muted-foreground text-pretty">
        <slot></slot>
      </p>`;
  }
};
var modal_default2 = {
  name: "modal",
  template: "",
  style: "",
  name: "modal",
  components: {
    "modal-trigger": ModalTrigger2,
    "modal-content": ModalContent2,
    "modal-header": ModalHeader2,
    "modal-footer": ModalFooter2,
    "modal-title": ModalTitle2,
    "modal-description": ModalDescription2,
    "modal-close": ModalClose2
  },
  setup() {
    const opened = state10(false);
    function open() {
      opened.value = true;
    }
    function close() {
      opened.value = false;
    }
    function isOpen() {
      return opened.value;
    }
    provide8("modal", { open, close, isOpen });
  },
  template(html) {
    return html`<div><slot></slot></div>`;
  }
};

// .webs/prebuild/gui/checkbox-demo.js
import { state as state11 } from "@conradklek/webs";
var checkbox_default2 = {
  name: "checkbox",
  template: "",
  style: "",
  name: "checkbox",
  props: {
    defaultChecked: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const isChecked = state11(props.defaultChecked);
    function toggle() {
      isChecked.value = !isChecked.value;
    }
    return {
      isChecked,
      toggle
    };
  },
  template(html) {
    return html`
        <button
          type="button"
          role="checkbox"
          :aria-checked="isChecked"
          @click="toggle"
          :data-state="isChecked ? 'checked' : 'unchecked'"
          class="peer h-4 w-4 shrink-0 rounded-sm border border-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-muted data-[state=checked]:bg-blue-600 data-[state=checked]:border-transparent"
        ></button>
      `;
  }
};
var checkbox_demo_default = {
  name: "checkbox-demo",
  template: `<div class="flex items-center space-x-2">
    <checkbox id="terms" />
    <label
      for="terms"
      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      Accept terms and conditions
    </label>
  </div>`,
  style: "",
  components: {
    checkbox: checkbox_default2
  }
};

// .webs/prebuild/gui/radio-group.js
import { provide as provide9, inject as inject9, state as state12 } from "@conradklek/webs";
var RadioGroupItem2 = {
  name: "radio-group-item",
  props: {
    value: { type: String, required: true }
  },
  setup(props) {
    const radioGroup = inject9("radioGroup");
    return { radioGroup, value: props.value };
  },
  template(html) {
    return html`
        <button
          type="button"
          role="radio"
          :aria-checked="radioGroup.is_selected(value)"
          :data-state="radioGroup.is_selected(value) ? 'checked' : 'unchecked'"
          @click="radioGroup.select(value)"
          class="aspect-square h-4 w-4 rounded-full border border-border text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if radioGroup.is_selected(value)}
          <div class="flex items-center justify-center">
            <div class="h-2.5 w-2.5 rounded-full bg-current fill-current"></div>
          </div>
          {/if}
        </button>
      `;
  }
};
var radio_group_default2 = {
  name: "radio-group",
  template: "",
  style: "",
  name: "radio-group",
  components: { "radio-group-item": RadioGroupItem2 },
  props: {
    defaultValue: { type: String }
  },
  setup(props) {
    const selectedValue = state12(props.defaultValue);
    function select(value) {
      selectedValue.value = value;
    }
    function is_selected(value) {
      return selectedValue.value === value;
    }
    provide9("radioGroup", { select, is_selected });
  },
  template(html) {
    return html`
        <div role="radiogroup" class="flex flex-col gap-2">
          <slot></slot>
        </div>
      `;
  }
};

// .webs/prebuild/gui/text-editor.js
import { fs, state as state13, watch } from "@conradklek/webs";
var text_editor_default = {
  name: "text-editor",
  template: `<div class="w-full relative">
    {#if file.isLoading && file.data === null}
    <div class="text-muted-foreground animate-pulse p-4">Loading file...</div>
    {/if} {#if file.error}
    <div class="text-red-500 font-medium p-4">Sync Error: {{ file.error }}</div>
    {/if}

    <textarea
      :value="localContent"
      @input="onInput"
      class="w-full h-96 p-4 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow font-mono"
      placeholder="Start typing..."
    ></textarea>
  </div>`,
  style: "",
  props: {
    filePath: String,
    initialContent: String
  },
  setup(props) {
    const file = fs(props.filePath).use(props.initialContent);
    const localContent = state13(props.initialContent || "");
    watch(() => file.data, (newData) => {
      if (newData !== null && newData !== localContent.value) {
        localContent.value = newData;
      }
    });
    let saveTimeout;
    function onInput(event) {
      localContent.value = event.target.value;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        file.write(localContent.value);
      }, 300);
    }
    return { file, localContent, onInput };
  }
};

// .webs/prebuild/gui/accordion.js
import { provide as provide10, inject as inject10, state as state14, computed as computed5 } from "@conradklek/webs";
var AccordionItem2 = {
  name: "accordion-item",
  props: {
    value: {
      type: String,
      required: true
    }
  },
  setup(props) {
    provide10("itemValue", props.value);
  },
  template: `
        <div class="w-full flex flex-col gap-1.5">
          <slot></slot>
        </div>
      `
};
var AccordionTrigger2 = {
  name: "accordion-trigger",
  setup() {
    const accordion = inject10("accordion");
    const { toggle } = accordion || {};
    const value = inject10("itemValue");
    return {
      handleClick: () => toggle && value && toggle(value)
    };
  },
  template: `
        <h3>
          <button
            type="button"
            @click="handleClick"
            class="w-full flex flex-row items-start justify-start cursor-pointer"
          >
            <span
              class="flex-1 flex flex-row items-start justify-start font-medium"
            >
              <slot></slot>
            </span>
          </button>
        </h3>
      `
};
var AccordionContent2 = {
  name: "accordion-content",
  setup() {
    const accordion = inject10("accordion");
    const { openItems } = accordion || {};
    const value = inject10("itemValue");
    const isOpen = computed5(() => openItems && openItems.has(value));
    return { isOpen };
  },
  template: `
        {#if isOpen}
        <div class="pb-3 pt-1">
          <slot></slot>
        </div>
        {/if}
      `
};
var accordion_default2 = {
  name: "accordion",
  template: "",
  style: "",
  name: "accordion",
  components: {
    "accordion-item": AccordionItem2,
    "accordion-trigger": AccordionTrigger2,
    "accordion-content": AccordionContent2
  },
  props: {
    type: {
      type: String,
      default: "single"
    },
    collapsible: {
      type: Boolean,
      default: true
    }
  },
  setup(props) {
    const openItems = state14(new Set);
    function toggle(value) {
      const newSet = new Set(openItems);
      if (props.type === "single") {
        if (newSet.has(value)) {
          if (props.collapsible) {
            newSet.delete(value);
          }
        } else {
          newSet.clear();
          newSet.add(value);
        }
      } else if (props.type === "multiple") {
        if (newSet.has(value)) {
          newSet.delete(value);
        } else {
          newSet.add(value);
        }
      }
      openItems.clear();
      for (const item of newSet) {
        openItems.add(item);
      }
    }
    provide10("accordion", {
      openItems,
      toggle
    });
  },
  template: `
        <div class="w-full flex flex-col items-start justify-start gap-3">
          <slot></slot>
        </div>
      `
};

// .webs/registry.js
var registry_default = {
  "card-demo": card_demo_default,
  "menubar-demo": menubar_demo_default,
  "tabs-demo": tabs_demo_default,
  breadcrumb: breadcrumb_default,
  "todo-list": todo_list_default,
  menubar: menubar_default2,
  "modal-demo": modal_demo_default,
  tabs: tabs_default2,
  "breadcrumb-demo": breadcrumb_demo_default,
  "radio-group-demo": radio_group_demo_default,
  checkbox: checkbox_default,
  "user-navbar": user_navbar_default,
  "accordion-demo": accordion_demo_default,
  card: card_default2,
  modal: modal_default2,
  "checkbox-demo": checkbox_demo_default,
  "radio-group": radio_group_default2,
  "text-editor": text_editor_default,
  accordion: accordion_default2
};

// webs-components:/Users/conradklek/webs/packages/webs-site/src/gui/tabs.webs
import { provide as provide11, inject as inject11, state as state15, computed as computed6 } from "@conradklek/webs";
var TabsContent3 = {
  name: "tabs-content",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab } = inject11("tabs");
    const isActive = computed6(() => activeTab.value === props.value);
    return { isActive };
  },
  template(html) {
    return html`
        {#if isActive}
        <div
          class="w-full mt-2 p-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <slot></slot>
        </div>
        {/if}
      `;
  }
};
var TabsTrigger3 = {
  name: "tabs-trigger",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab, activateTab } = inject11("tabs");
    const isActive = computed6(() => activeTab.value === props.value);
    const handleClick = () => activateTab(props.value);
    return { isActive, handleClick };
  },
  template(html) {
    return html`
        <button
          type="button"
          @click="handleClick"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-popover data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          :data-state="isActive ? 'active' : 'inactive'"
        >
          <slot></slot>
        </button>
      `;
  }
};
var TabsList3 = {
  name: "tabs-list",
  template(html) {
    return html`<div
        class="inline-flex w-full h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground"
      >
        <slot></slot>
      </div>`;
  }
};
var tabs_default3 = {
  name: "tabs",
  template: "",
  style: "",
  name: "tabs",
  components: {
    "tabs-list": TabsList3,
    "tabs-trigger": TabsTrigger3,
    "tabs-content": TabsContent3
  },
  props: {
    defaultValue: { type: String, required: true }
  },
  setup(props) {
    const activeTab = state15(props.defaultValue);
    function activateTab(value) {
      activeTab.value = value;
    }
    provide11("tabs", { activeTab, activateTab });
  },
  template: (html) => html`<div class="w-full flex flex-col"><slot></slot></div>`
};

// webs-components:/Users/conradklek/webs/packages/webs-site/src/gui/tabs-demo.webs
var tabs_demo_default2 = {
  name: "tabs-demo",
  template: `<tabs defaultValue="account">
    <tabs-list>
      <tabs-trigger value="account">Account</tabs-trigger>
      <tabs-trigger value="password">Password</tabs-trigger>
    </tabs-list>
    <tabs-content value="account">
      Make changes to your account here. Click save when you're done.
    </tabs-content>
    <tabs-content value="password">
      Change your password here. After saving, you'll be logged out.
    </tabs-content>
  </tabs>`,
  style: "",
  components: {
    ...registry_default,
    tabs: tabs_default3,
    ...tabs_default3.components
  }
};
export {
  tabs_demo_default2 as default
};
