export default {
  name: "CardDescription",
  styles: `
    @layer components {
      .card-description {
        @apply text-sm text-muted-foreground;
      }
    }
  `,
  template: `
    <p class="card-description">
      <slot></slot>
    </p>
  `,
};
