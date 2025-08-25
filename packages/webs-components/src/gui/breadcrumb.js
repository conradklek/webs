export const BreadcrumbEllipsis = {
  name: 'BreadcrumbEllipsis',
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

export const BreadcrumbItem = {
  name: 'BreadcrumbItem',
  template(html) {
    return html`
      <li class="inline-flex items-center gap-1.5">
        <slot></slot>
      </li>
    `;
  },
};

export const BreadcrumbLink = {
  name: 'BreadcrumbLink',
  template(html) {
    return html`
      <a class="text-blue-600 underline hover:opacity-75 active:opacity-50">
        <slot></slot>
      </a>
    `;
  },
};

export const BreadcrumbList = {
  name: 'BreadcrumbList',
  template(html) {
    return html`
      <ol class="flex flex-wrap items-center gap-1.5 break-words sm:gap-2.5">
        <slot></slot>
      </ol>
    `;
  },
};

export const BreadcrumbActive = {
  name: 'BreadcrumbActive',
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

export const BreadcrumbSeparator = {
  name: 'BreadcrumbSeparator',
  template(html) {
    return html`
      <li role="presentation" aria-hidden="true" class="text-muted-foreground">
        /
      </li>
    `;
  },
};

export const Breadcrumb = {
  name: 'Breadcrumb',
  components: {
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbActive,
    BreadcrumbSeparator,
    BreadcrumbEllipsis,
  },
  template(html) {
    return html`
      <nav aria-label="breadcrumb">
        <slot></slot>
      </nav>
    `;
  },
};
