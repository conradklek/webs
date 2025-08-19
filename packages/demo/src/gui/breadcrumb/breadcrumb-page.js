export default {
  name: "BreadcrumbPage",
  template: `
    <span role="link" aria-disabled="true" aria-current="page" class="font-normal text-foreground">
      <slot></slot>
    </span>
  `,
};
