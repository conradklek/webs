// @bun
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
export {
  card_demo_default as default
};
