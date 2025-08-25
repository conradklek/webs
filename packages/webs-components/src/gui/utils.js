export const ComponentWrapper = {
  name: 'ComponentWrapper',
  template(html) {
    return html`
      <div class="w-full p-8 flex flex-col items-start justify-start gap-6">
        <div class="w-full flex flex-row items-center justify-between gap-4">
          <a href="/components" class="font-medium">webs.site/components</a>
        </div>
        <div class="flex-1 flex flex-col items-start justify-start gap-4">
          <slot></slot>
        </div>
      </div>
    `;
  },
};
