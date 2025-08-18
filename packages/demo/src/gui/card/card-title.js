export default {
  name: "CardTitle",
  styles: `
    @layer components {
      .card-title {
        @apply text-lg font-medium leading-none;
      }
    }
  `,
  template: `
    <h3 class="card-title">
      <slot></slot>
    </h3>
  `,
};
