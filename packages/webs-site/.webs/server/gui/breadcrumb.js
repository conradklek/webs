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
export {
  breadcrumb_default as default,
  BreadcrumbSeparator,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbItem,
  BreadcrumbEllipsis,
  BreadcrumbActive
};
