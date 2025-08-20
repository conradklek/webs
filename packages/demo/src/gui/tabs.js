export const TabsRoot = {
  name: "Tabs",
  props: {
    defaultValue: {
      type: String,
      required: true,
    },
  },
  setup({ props, provide, reactive }) {
    const state = reactive({
      activeTab: props.defaultValue,
    });

    const activateTab = (value) => {
      console.log(`[Tabs] Activating tab: '${value}'.`);
      state.activeTab = value;
    };

    const is_active = (value) => {
      return state.activeTab === value;
    };

    provide("tabs", {
      activateTab,
      is_active,
    });
  },
  template: `
    <div class="w-full flex flex-col">
      <slot></slot>
    </div>
  `,
};

export const TabsContent = {
  name: "TabsContent",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup({ props, inject }) {
    const tabs = inject("tabs");
    return { tabs, value: props.value };
  },
  styles: `
  @layer components {
    .tabs-content {
      @apply w-full mt-2 p-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2;
    }
  }
  `,
  template: `
    <div w-if="tabs.is_active(value)" class="tabs-content">
      <slot></slot>
    </div>
  `,
};

export const TabsTrigger = {
  name: "TabsTrigger",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup({ props, inject }) {
    const tabs = inject("tabs");
    return { tabs, value: props.value };
  },
  styles: `
  @layer components {
    .tabs-trigger {
      @apply inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50;
    }
    .tabs-trigger[data-state="active"] {
      @apply bg-background text-foreground shadow-sm;
    }
  }
  `,
  template: `
    <button
      type="button"
      @click="tabs.activateTab(value)"
      class="tabs-trigger"
      :data-state="tabs.is_active(value) ? 'active' : 'inactive'"
    >
      <slot></slot>
    </button>
  `,
};

export const TabsList = {
  name: "TabsList",
  template: `
    <div class="inline-flex w-full h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground">
      <slot></slot>
    </div>
  `,
};

TabsRoot.components = {
  TabsList,
  TabsTrigger,
  TabsContent,
};

export default TabsRoot;
