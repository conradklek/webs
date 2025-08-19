export default {
  name: "BreadcrumbList",
  template: `
    <ol class="flex flex-wrap items-center gap-1.5 break-words text-muted-foreground sm:gap-2.5">
      <slot></slot>
    </ol>
  `,
};
