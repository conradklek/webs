import {
  provide,
  inject,
  useState,
  onMounted,
  onUnmounted,
} from '@conradklek/webs';

export const MenubarMenu = {
  name: 'MenubarMenu',
  props: { value: { type: String, required: true } },
  setup(props) {
    provide('menuValue', props.value);
  },
  template(html) {
    return html`<div class="relative"><slot></slot></div>`;
  },
};

export const MenubarTrigger = {
  name: 'MenubarTrigger',
  setup() {
    const menubar = inject('menubar');
    const menuValue = inject('menuValue');
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
  },
};

export const MenubarContent = {
  name: 'MenubarContent',
  setup() {
    const menubar = inject('menubar');
    const menuValue = inject('menuValue');
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
  },
};

export const MenubarItem = {
  name: 'MenubarItem',
  setup() {
    const menubar = inject('menubar');
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

export const MenubarSub = {
  name: 'MenubarSub',
  setup() {
    const isOpen = useState(false);
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

    provide('submenu', { open, close, is_open });

    return { open, close };
  },
  template(html) {
    return html`<div class="relative" @mouseenter="open" @mouseleave="close">
      <slot></slot>
    </div>`;
  },
};

export const MenubarSubTrigger = {
  name: 'MenubarSubTrigger',
  setup() {
    const submenu = inject('submenu');
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
  },
};

export const MenubarSubContent = {
  name: 'MenubarSubContent',
  setup() {
    const submenu = inject('submenu');
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
  },
};

export const MenubarSeparator = {
  name: 'MenubarSeparator',
  template(html) {
    return html`<div class="-mx-1 my-1 h-px bg-muted"></div>`;
  },
};

export const MenubarShortcut = {
  name: 'MenubarShortcut',
  template(html) {
    return html`<span
      class="ml-auto text-xs tracking-widest text-muted-foreground"
      ><slot></slot
    ></span>`;
  },
};

export const MenubarLabel = {
  name: 'MenubarLabel',
  template(html) {
    return html`<div class="px-2 py-1.5 text-sm font-semibold">
      <slot></slot>
    </div>`;
  },
};

export const MenubarGroup = {
  name: 'MenubarGroup',
  template(html) {
    return html`<div><slot></slot></div>`;
  },
};

export const Menubar = {
  name: 'Menubar',
  components: {
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
  },
  setup() {
    const activeMenu = useState(null);

    onMounted(() => console.log('Menubar Mounted!'));
    onUnmounted(() => console.log('Menubar Dismounted!'));

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

    provide('menubar', { openMenu, closeMenu, toggleMenu, is_open });
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
