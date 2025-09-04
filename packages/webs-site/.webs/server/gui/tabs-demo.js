// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/tabs.webs
import { provide, inject, state, computed } from "@conradklek/webs";
var TabsContent = {
  name: "tabs-content",
  props: { value: { type: String, required: true } },
  setup(props) {
    const { activeTab } = inject("tabs");
    const isActive = computed(() => activeTab.value === props.value);
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
    const { activeTab, activateTab } = inject("tabs");
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
  components: {
    "tabs-list": TabsList,
    "tabs-trigger": TabsTrigger,
    "tabs-content": TabsContent
  },
  props: {
    defaultValue: { type: String, required: true }
  },
  setup(props) {
    const activeTab = state(props.defaultValue);
    function activateTab(value) {
      activeTab.value = value;
    }
    provide("tabs", { activeTab, activateTab });
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
export {
  tabs_demo_default as default
};
