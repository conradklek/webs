import { provide, inject, useState } from '@conradklek/webs';

export const TabsContent = {
  name: 'TabsContent',
  props: { value: { type: String, required: true } },
  setup(props) {
    const tabs = inject('tabs');
    return { tabs, value: props.value };
  },
  template(html) {
    return html`<div
      w-if="tabs.is_active(value)"
      class="w-full mt-2 p-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <slot></slot>
    </div>`;
  },
};

export const TabsTrigger = {
  name: 'TabsTrigger',
  props: { value: { type: String, required: true } },
  setup(props) {
    const tabs = inject('tabs');
    return { tabs, value: props.value };
  },
  template(html) {
    return html`
      <button
        type="button"
        @click="tabs.activateTab(value)"
        class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        :data-state="tabs.is_active(value) ? 'active' : 'inactive'"
      >
        <slot></slot>
      </button>
    `;
  },
};

export const TabsList = {
  name: 'TabsList',
  template(html) {
    return html`<div
      class="inline-flex w-full h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground"
    >
      <slot></slot>
    </div>`;
  },
};

export const Tabs = {
  name: 'Tabs',
  components: { TabsList, TabsTrigger, TabsContent },
  props: {
    defaultValue: { type: String, required: true },
  },
  setup(props) {
    const activeTab = useState(props.defaultValue);

    function activateTab(value) {
      activeTab.value = value;
    }
    function is_active(value) {
      return activeTab.value === value;
    }

    provide('tabs', { activateTab, is_active });
  },
  template: (html) =>
    html`<div class="w-full flex flex-col"><slot></slot></div>`,
};
