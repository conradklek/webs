export default {
  name: "CardHeader",
  styles: `
    @layer components {
      .card-header {
        @apply flex flex-col space-y-1.5 p-6;
      }
    }
  `,
  template: `
    <div class="card-header">
      <slot></slot>
    </div>
  `,
};
