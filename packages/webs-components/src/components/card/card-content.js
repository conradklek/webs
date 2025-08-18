export default {
  name: "CardContent",
  styles: `
    @layer components {
      .card-content {
        @apply p-6 pt-0;
      }
    }
  `,
  template: `
    <div class="card-content">
      <slot></slot>
    </div>
  `,
};
