// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/accordion.webs
import { provide, inject, state, computed } from "@conradklek/webs";
var AccordionItem = {
  name: "accordion-item",
  props: {
    value: {
      type: String,
      required: true
    }
  },
  setup(props) {
    provide("itemValue", props.value);
  },
  template(html) {
    return html`
        <div class="w-full flex flex-col gap-1.5">
          <slot></slot>
        </div>
      `;
  }
};
var AccordionTrigger = {
  name: "accordion-trigger",
  setup() {
    const accordion = inject("accordion");
    const { toggle } = accordion || {};
    const value = inject("itemValue");
    return {
      handleClick: () => toggle && value && toggle(value)
    };
  },
  template(html) {
    return html`
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
      `;
  }
};
var AccordionContent = {
  name: "accordion-content",
  setup() {
    const accordion = inject("accordion");
    const { openItems } = accordion || {};
    const value = inject("itemValue");
    const isOpen = computed(() => openItems && openItems.has(value));
    return { isOpen };
  },
  template(html) {
    return html`
        <div w-if="isOpen" class="pb-3 pt-1">
          <slot></slot>
        </div>
      `;
  }
};
var accordion_default = {
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
    const openItems = state(new Set);
    function toggle(value) {
      if (props.type === "single") {
        if (openItems.has(value)) {
          if (props.collapsible) {
            openItems.delete(value);
          }
        } else {
          openItems.clear();
          openItems.add(value);
        }
      } else if (props.type === "multiple") {
        if (openItems.has(value)) {
          openItems.delete(value);
        } else {
          openItems.add(value);
        }
      }
    }
    provide("accordion", {
      openItems,
      toggle
    });
  },
  template(html) {
    return html`
        <div class="w-full flex flex-col items-start justify-start gap-3">
          <slot></slot>
        </div>
      `;
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/accordion-demo.webs
var accordion_demo_default = {
  name: "accordion-demo",
  template: `
  <accordion type="single" collapsible>
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
  </accordion>
`,
  style: ``,
  components: {
    accordion: accordion_default,
    ...accordion_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/breadcrumb.webs
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

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/breadcrumb-demo.webs
var breadcrumb_demo_default = {
  name: "breadcrumb-demo",
  template: `
  <breadcrumb>
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
  </breadcrumb>
`,
  style: ``,
  components: {
    breadcrumb: breadcrumb_default,
    ...breadcrumb_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/card.webs
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

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/card-demo.webs
var card_demo_default = {
  name: "card-demo",
  template: `
  <card class="w-[350px]">
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
  </card>
`,
  style: ``,
  components: {
    card: card_default,
    ...card_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/checkbox.webs
import { state as state2 } from "@conradklek/webs";
var checkbox_default = {
  name: "checkbox",
  props: {
    defaultChecked: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const isChecked = state2(props.defaultChecked);
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

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/checkbox-demo.webs
var checkbox_demo_default = {
  name: "checkbox-demo",
  template: `
  <div class="flex items-center space-x-2">
    <checkbox id="terms" />
    <label
      for="terms"
      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      Accept terms and conditions
    </label>
  </div>
`,
  style: ``,
  components: {
    checkbox: checkbox_default
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/menubar.webs
import {
  provide as provide2,
  inject as inject2,
  state as state3,
  onMounted,
  onUnmounted
} from "@conradklek/webs";
var MenubarMenu = {
  name: "menubar-menu",
  props: { value: { type: String, required: true } },
  setup(props) {
    provide2("menuValue", props.value);
  },
  template(html) {
    return html`<div class="relative"><slot></slot></div>`;
  }
};
var MenubarTrigger = {
  name: "menubar-trigger",
  setup() {
    const menubar = inject2("menubar");
    const menuValue = inject2("menuValue");
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
    const menubar = inject2("menubar");
    const menuValue = inject2("menuValue");
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
    const menubar = inject2("menubar");
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
    const isOpen = state3(false);
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
    provide2("submenu", { open, close, is_open });
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
    const submenu = inject2("submenu");
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
    const submenu = inject2("submenu");
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
    const activeMenu = state3(null);
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
    provide2("menubar", { openMenu, closeMenu, toggleMenu, is_open });
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

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/menubar-demo.webs
var menubar_demo_default = {
  name: "menubar-demo",
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
  components: {
    menubar: menubar_default,
    ...menubar_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/modal.webs
import { provide as provide3, inject as inject3, state as state4 } from "@conradklek/webs";
var ModalTrigger = {
  name: "modal-trigger",
  setup() {
    const modal = inject3("modal");
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
    const modal = inject3("modal");
    return { modal };
  },
  template(html) {
    return html`<button @click="modal.close()"><slot></slot></button>`;
  }
};
var ModalContent = {
  name: "modal-content",
  setup() {
    const modal = inject3("modal");
    return { modal };
  },
  template(html) {
    return html`
        <div w-if="modal && modal.isOpen()">
          <div
            class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-md rounded-lg"
          >
            <slot></slot>
          </div>
        </div>
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
    const opened = state4(false);
    function open() {
      opened.value = true;
    }
    function close() {
      opened.value = false;
    }
    function isOpen() {
      return opened.value;
    }
    provide3("modal", { open, close, isOpen });
  },
  template(html) {
    return html`<div><slot></slot></div>`;
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/modal-demo.webs
var modal_demo_default = {
  name: "modal-demo",
  template: `
  <modal>
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
  </modal>
`,
  style: ``,
  components: {
    modal: modal_default,
    ...modal_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/radio-group.webs
import { provide as provide4, inject as inject4, state as state5 } from "@conradklek/webs";
var RadioGroupItem = {
  name: "radio-group-item",
  props: {
    value: { type: String, required: true }
  },
  setup(props) {
    const radioGroup = inject4("radioGroup");
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
          <div
            w-if="radioGroup.is_selected(value)"
            class="flex items-center justify-center"
          >
            <div class="h-2.5 w-2.5 rounded-full bg-current fill-current"></div>
          </div>
        </button>
      `;
  }
};
var radio_group_default = {
  name: "radio-group",
  components: { "radio-group-item": RadioGroupItem },
  props: {
    defaultValue: { type: String }
  },
  setup(props) {
    const selectedValue = state5(props.defaultValue);
    function select(value) {
      selectedValue.value = value;
    }
    function is_selected(value) {
      return selectedValue.value === value;
    }
    provide4("radioGroup", { select, is_selected });
  },
  template(html) {
    return html`
        <div role="radiogroup" class="flex flex-col gap-2">
          <slot></slot>
        </div>
      `;
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/radio-group-demo.webs
var radio_group_demo_default = {
  name: "radio-group-demo",
  template: `
  <radio-group defaultValue="comfortable">
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
  </radio-group>
`,
  style: ``,
  components: {
    "radio-group": radio_group_default,
    ...radio_group_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/tabs.webs
import { provide as provide5, inject as inject5, state as state6, computed as computed2 } from "@conradklek/webs";
var TabsContent = {
  name: "tabs-content",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab } = inject5("tabs");
    const isActive = computed2(() => activeTab.value === props.value);
    return { isActive };
  },
  template(html) {
    return html`<div
        w-if="isActive"
        class="w-full mt-2 p-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <slot></slot>
      </div>`;
  }
};
var TabsTrigger = {
  name: "tabs-trigger",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab, activateTab } = inject5("tabs");
    const isActive = computed2(() => activeTab.value === props.value);
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
  components: {
    "tabs-list": TabsList,
    "tabs-trigger": TabsTrigger,
    "tabs-content": TabsContent
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

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/tabs-demo.webs
var tabs_demo_default = {
  name: "tabs-demo",
  template: `
  <tabs defaultValue="account">
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
  </tabs>
`,
  style: ``,
  components: {
    tabs: tabs_default,
    ...tabs_default.components
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/components/[component].webs
var __component__default = {
  name: "[component]",
  template: `
  <div class="w-full flex flex-col items-start justify-start gap-6">
    <div class="w-full flex flex-row items-center justify-start gap-4">
      <a href="/components" class="link">components</a>
      <span>/</span>
      <h1>{{ params.component }}</h1>
    </div>
    <div class="w-full p-6 bg-white border border-border rounded-lg">
      <component :is="params.component + '-demo'"></component>
    </div>
  </div>
`,
  style: ``,
  components: {
    "accordion-demo": accordion_demo_default,
    "breadcrumb-demo": breadcrumb_demo_default,
    "card-demo": card_demo_default,
    "checkbox-demo": checkbox_demo_default,
    "menubar-demo": menubar_demo_default,
    "modal-demo": modal_demo_default,
    "radio-group-demo": radio_group_demo_default,
    "tabs-demo": tabs_demo_default
  },
  setup() {
    return {};
  }
};
export {
  __component__default as default
};
