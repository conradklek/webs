export default {
  name: "Card",
  styles: `
    @layer components {
      .card {
        @apply rounded-lg border bg-card text-card-foreground shadow-sm;
      }
    }
  `,
  template: `
    <div class="card">
      <slot></slot>
    </div>
  `,
};
