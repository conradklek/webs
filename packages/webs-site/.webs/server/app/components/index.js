// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/app/components/index.webs
var components_default = {
  name: "index",
  template: `
  <div class="w-full flex flex-col items-start justify-start gap-4">
    <ul class="list-disc pl-8 space-y-1">
      <li w-for="component in components" :key="component.name">
        <a :href="component.url" class="link">{{ component.name }}</a>
      </li>
    </ul>
  </div>
`,
  style: ``,
  setup() {
    const components = [
      { name: "Accordion", url: "/components/accordion" },
      { name: "Breadcrumb", url: "/components/breadcrumb" },
      { name: "Card", url: "/components/card" },
      { name: "Menubar", url: "/components/menubar" },
      { name: "Modal", url: "/components/modal" },
      { name: "Checkbox", url: "/components/checkbox" },
      { name: "Radio", url: "/components/radio-group" },
      { name: "Tabs", url: "/components/tabs" }
    ];
    return { components };
  }
};
export {
  components_default as default
};
