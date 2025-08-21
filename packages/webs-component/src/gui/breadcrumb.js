const BreadcrumbEllipsis = {
  name: "BreadcrumbEllipsis",
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
  },
};

const BreadcrumbItem = {
  name: "BreadcrumbItem",
  template(html) {
    return html`
      <li class="inline-flex items-center gap-1.5">
        <slot></slot>
      </li>
    `;
  },
};

const BreadcrumbLink = {
  name: "BreadcrumbLink",
  template(html) {
    return html`
      <a class="text-blue-600 underline hover:opacity-75 active:opacity-50">
        <slot></slot>
      </a>
    `;
  },
};

const BreadcrumbList = {
  name: "BreadcrumbList",
  template(html) {
    return html`
      <ol class="flex flex-wrap items-center gap-1.5 break-words sm:gap-2.5">
        <slot></slot>
      </ol>
    `;
  },
};

const BreadcrumbActive = {
  name: "BreadcrumbActive",
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
  },
};

const BreadcrumbSeparator = {
  name: "BreadcrumbSeparator",
  template(html) {
    return html`
      <li role="presentation" aria-hidden="true" class="text-muted-foreground">
        /
      </li>
    `;
  },
};

const Breadcrumb = {
  name: "Breadcrumb",
  template(html) {
    return html`
      <nav aria-label="breadcrumb">
        <slot></slot>
      </nav>
    `;
  },
};

Breadcrumb.components = {
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbActive,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};

export default Breadcrumb;
