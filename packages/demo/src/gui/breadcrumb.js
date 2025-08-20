const BreadcrumbEllipsis = {
  name: "BreadcrumbEllipsis",
  template: `
    <span role="presentation" aria-hidden="true" class="flex size-8 items-center justify-center">
      ...
      <span class="sr-only">More</span>
    </span>
  `,
};

const BreadcrumbItem = {
  name: "BreadcrumbItem",
  template: `
    <li class="inline-flex items-center gap-1.5">
      <slot></slot>
    </li>
  `,
};

const BreadcrumbLink = {
  name: "BreadcrumbLink",
  template: `
    <a class="transition-colors hover:text-foreground">
      <slot></slot>
    </a>
  `,
};

const BreadcrumbList = {
  name: "BreadcrumbList",
  template: `
    <ol class="flex flex-wrap items-center gap-1.5 break-words text-muted-foreground sm:gap-2.5">
      <slot></slot>
    </ol>
  `,
};

const BreadcrumbPage = {
  name: "BreadcrumbPage",
  template: `
    <span role="link" aria-disabled="true" aria-current="page" class="font-normal text-foreground">
      <slot></slot>
    </span>
  `,
};

const BreadcrumbSeparator = {
  name: "BreadcrumbSeparator",
  template: `
    <li role="presentation" aria-hidden="true">
      /
    </li>
  `,
};

const Breadcrumb = {
  name: "Breadcrumb",
  template: `
    <nav aria-label="breadcrumb">
      <slot></slot>
    </nav>
  `,
};

Breadcrumb.components = {
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};

export default Breadcrumb;
