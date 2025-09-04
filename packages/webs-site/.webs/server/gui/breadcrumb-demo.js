// @bun
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
export {
  breadcrumb_demo_default as default
};
