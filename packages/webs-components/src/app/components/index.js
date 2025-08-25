export default {
  name: 'ComponentsIndex',
  setup() {
    return {
      components: [
        { name: 'Accordion', url: '/components/accordion' },
        { name: 'Breadcrumb', url: '/components/breadcrumb' },
        { name: 'Card', url: '/components/card' },
        { name: 'Menubar', url: '/components/menubar' },
        { name: 'Modal', url: '/components/modal' },
        { name: 'Checkbox', url: '/components/checkbox' },
        { name: 'Radio Group', url: '/components/radio-group' },
        { name: 'Tabs', url: '/components/tabs' },
        { name: 'Toggle Group', url: '/components/toggle-group' },
      ],
    };
  },
  template(html) {
    return html`
      <div class="w-full p-8 flex flex-col items-start justify-start gap-6">
        <div class="w-full flex flex-row items-center justify-between gap-4">
          <a href="/" class="font-medium">webs.site</a>
          <div class="w-full flex flex-row items-center justify-end gap-4">
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
        </div>
        <div class="flex-1 flex flex-col items-start justify-start gap-4">
          <h1>Components</h1>
          <ul class="list-disc pl-8 space-y-0.5">
            <li w-for="component in components">
              <a
                :href="component.url"
                class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
                >{{ component.name }}</a
              >
            </li>
          </ul>
        </div>
      </div>
    `;
  },
};
