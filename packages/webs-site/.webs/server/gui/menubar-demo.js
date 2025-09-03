// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/menubar.webs
import {
  provide,
  inject,
  state,
  onMounted,
  onUnmounted
} from "@conradklek/webs";
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
        <div
          w-if="menubar && menubar.is_open(menuValue)"
          class="absolute z-50 min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md top-full translate-y-2 origin-top"
        >
          <slot></slot>
        </div>
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
        <div
          w-if="submenu && submenu.is_open()"
          class="absolute z-50 min-w-[8rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md left-full -top-2"
        >
          <slot></slot>
        </div>
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
  template: ``,
  style: ``,
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
    onMounted(() => console.log("Menubar Mounted!"));
    onUnmounted(() => console.log("Menubar Dismounted!"));
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
          class="flex h-10 items-center space-x-1 border border-border rounded-md bg-background p-1"
        >
          <slot></slot>
        </div>
      `;
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/menubar-demo.webs
var menubar_demo_default = {
  template: `
  <menubar>
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
  </menubar>
`,
  style: ``,
  name: "menubar-demo",
  components: {
    menubar: menubar_default,
    ...menubar_default.components
  }
};
export {
  menubar_demo_default as default
};
