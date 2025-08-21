const Menubar = {
  name: "Menubar",
  setup({ provide, reactive, onMounted, onUnmounted }) {
    const state = reactive({
      activeMenu: null,
    });

    const openMenu = (value) => {
      state.activeMenu = value;
    };

    const closeMenu = () => {
      state.activeMenu = null;
    };

    const toggleMenu = (value) => {
      state.activeMenu = state.activeMenu === value ? null : value;
    };

    const is_open = (value) => {
      return state.activeMenu === value;
    };

    onMounted(() => {
      console.log("Menubar Mounted!");
    });

    onUnmounted(() => {
      console.log("Menubar Dismounted!");
    });

    provide("menubar", {
      openMenu,
      closeMenu,
      toggleMenu,
      is_open,
    });
  },
  template(html) {
    return html`
      <div
        class="flex h-10 items-center space-x-1 border border-border rounded-md bg-background p-1"
      >
        <slot></slot>
      </div>
    `;
  },
};

const MenubarMenu = {
  name: "MenubarMenu",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup({ props, provide }) {
    provide("menuValue", props.value);
  },
  template(html) {
    return html`
      <div class="relative">
        <slot></slot>
      </div>
    `;
  },
};

const MenubarTrigger = {
  name: "MenubarTrigger",
  setup({ inject }) {
    const menubar = inject("menubar");
    const menuValue = inject("menuValue");
    return { menubar, menuValue };
  },
  template(html) {
    return html`
      <button
        type="button"
        @click="menubar.toggleMenu(menuValue)"
        :data-state="menubar.is_open(menuValue) ? 'open' : 'closed'"
        class="flex cursor-default select-none items-center rounded-sm px-3 py-1.5 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
      >
        <slot></slot>
      </button>
    `;
  },
};

const MenubarContent = {
  name: "MenubarContent",
  setup({ inject }) {
    const menubar = inject("menubar");
    const menuValue = inject("menuValue");
    return { menubar, menuValue };
  },
  template(html) {
    return html`
      <div
        w-if="menubar.is_open(menuValue)"
        class="absolute z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md top-full translate-y-2 origin-top"
      >
        <slot></slot>
      </div>
    `;
  },
};

const MenubarItem = {
  name: "MenubarItem",
  setup({ inject }) {
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
  },
};

const MenubarSeparator = {
  name: "MenubarSeparator",
  template(html) {
    return html` <div class="-mx-1 my-1 h-px bg-muted"></div> `;
  },
};

const MenubarShortcut = {
  name: "MenubarShortcut",
  template(html) {
    return html`
      <span class="ml-auto text-xs tracking-widest text-muted-foreground">
        <slot></slot>
      </span>
    `;
  },
};

const MenubarLabel = {
  name: "MenubarLabel",
  template(html) {
    return html`<div class="px-2 py-1.5 text-sm font-semibold">
      <slot></slot>
    </div>`;
  },
};

const MenubarGroup = {
  name: "MenubarGroup",
  template(html) {
    return html`<div><slot></slot></div>`;
  },
};

const MenubarSub = {
  name: "MenubarSub",
  setup({ provide, reactive }) {
    const state = reactive({ isOpen: false });

    let closeTimer = null;
    const open = () => {
      clearTimeout(closeTimer);
      state.isOpen = true;
    };
    const close = () => {
      closeTimer = setTimeout(() => {
        state.isOpen = false;
      }, 100);
    };
    const is_open = () => state.isOpen;

    provide("submenu", { open, close, is_open });
  },
  template(html) {
    return html`
      <div
        class="relative"
        @mouseenter="submenu.open()"
        @mouseleave="submenu.close()"
      >
        <slot></slot>
      </div>
    `;
  },
};

const MenubarSubTrigger = {
  name: "MenubarSubTrigger",
  setup({ inject }) {
    const submenu = inject("submenu");
    return { submenu };
  },
  template(html) {
    return html`
      <div
        :data-state="submenu.is_open() ? 'open' : 'closed'"
        class="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
      >
        <span class="flex-1"><slot></slot></span>
      </div>
    `;
  },
};

const MenubarSubContent = {
  name: "MenubarSubContent",
  setup({ inject }) {
    const submenu = inject("submenu");
    return { submenu };
  },
  template(html) {
    return html`
      <div
        w-if="submenu.is_open()"
        class="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md left-full -top-2"
      >
        <slot></slot>
      </div>
    `;
  },
};

Menubar.components = {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarLabel,
  MenubarGroup,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
};

export default Menubar;
