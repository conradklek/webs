export default {
  name: "CardFooter",
  styles: `
    @layer components {
      .card-footer {
        @apply flex items-center p-6 pt-0;
      }
    }
  `,
  template: `
    <div class="card-footer">
      <slot></slot>
    </div>
  `,
};
