export default {
  name: "CardTitle",
  styles: `
    @layer components {
      .card-title {
        @apply text-2xl font-semibold leading-none tracking-tight;
      }
    }
  `,
  template: `
    <h3 class="card-title">
      <slot></slot>
    </h3>
  `,
};
