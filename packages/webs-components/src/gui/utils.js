export const components = [
  { name: 'Accordion', url: '/components/accordion' },
  { name: 'Breadcrumb', url: '/components/breadcrumb' },
  { name: 'Card', url: '/components/card' },
  { name: 'Menubar', url: '/components/menubar' },
  { name: 'Modal', url: '/components/modal' },
  { name: 'Checkbox', url: '/components/checkbox' },
  { name: 'Radio Group', url: '/components/radio-group' },
  { name: 'Tabs', url: '/components/tabs' },
  { name: 'Toggle Group', url: '/components/toggle-group' },
];

export const ComponentWrapper = {
  name: 'ComponentWrapper',
  props: {
    componentName: { type: String, required: true },
  },
  setup(props) {
    const currentIndex = components.findIndex(
      (c) => c.name === props.componentName,
    );
    const prevComponent =
      currentIndex > 0 ? components[currentIndex - 1] : null;
    const nextComponent =
      currentIndex < components.length - 1
        ? components[currentIndex + 1]
        : null;

    return { prevComponent, nextComponent };
  },
  template(html) {
    return html`
      <div
        class="w-full min-h-dvh p-8 flex flex-col items-start justify-start gap-6"
      >
        <div class="w-full flex flex-row items-center justify-between gap-4">
          <a href="/components" class="font-medium">webs.site/components</a>
        </div>
        <div
          class="flex-1 w-full flex flex-col items-start justify-start gap-4"
        >
          <slot></slot>
        </div>
        <footer
          class="w-full mt-auto flex flex-row items-center justify-between gap-4"
        >
          <a
            w-if="prevComponent"
            :href="prevComponent.url"
            class="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <span>&larr;</span>
            <span>{{ prevComponent.name }}</span>
          </a>
          <a
            w-if="nextComponent"
            :href="nextComponent.url"
            class="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted ml-auto"
          >
            <span>{{ nextComponent.name }}</span>
            <span>&rarr;</span>
          </a>
        </footer>
      </div>
    `;
  },
};
