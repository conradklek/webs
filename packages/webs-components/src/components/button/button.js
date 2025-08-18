export default {
  name: "Button",
  props: {
    variant: {
      type: String,
      default: "primary",
    },
  },
  styles: `
    @layer components {
      .btn {
        @apply inline-flex items-center justify-center rounded px-1.5 py-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2;
      }
      .btn-primary {
        @apply text-primary focus:ring-primary;
      }
      .btn-secondary {
        @apply text-current;
      }
    }
  `,
  template: `
    <button :class="'btn ' + (variant === 'primary' ? 'btn-primary' : 'btn-secondary')">
      <slot></slot>
    </button>
  `,
};
