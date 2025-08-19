export default {
  name: "Button",
  props: {
    variant: {
      type: String,
      default: "default",
    },
    size: {
      type: String,
      default: "default",
    },
  },
  methods: {
    getButtonClasses() {
      const variantClasses = {
        default: "btn-default",
        destructive: "btn-destructive",
        outline: "btn-outline",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        link: "btn-link",
      };

      const sizeClasses = {
        default: "btn-size-default",
        sm: "btn-size-sm",
        lg: "btn-size-lg",
        icon: "btn-size-icon",
      };
      return [
        "btn",
        variantClasses[this.variant] || variantClasses.default,
        sizeClasses[this.size] || sizeClasses.default,
      ].join(" ");
    },
  },
  styles: `
    @layer components {
      .btn {
        @apply inline-flex items-center justify-center whitespace-nowrap rounded text-sm tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer;
      }

      .btn-default {
        @apply bg-primary text-primary-foreground hover:bg-primary/90;
      }
      .btn-destructive {
        @apply bg-destructive text-white hover:bg-destructive/90;
      }
      .btn-outline {
        @apply border border-input bg-background hover:bg-accent hover:text-accent-foreground;
      }
      .btn-secondary {
        @apply bg-secondary text-secondary-foreground hover:bg-secondary/80;
      }
      .btn-ghost {
        @apply hover:bg-accent hover:text-accent-foreground;
      }
      .btn-link {
        @apply text-primary underline-offset-4 hover:underline;
      }

      .btn-size-default {
        @apply h-8 px-2 py-1;
      }
      .btn-size-sm {
        @apply h-7 rounded-md px-1.5;
      }
      .btn-size-lg {
        @apply h-10 px-2;
      }
      .btn-size-icon {
        @apply w-8 h-8;
      }
    }
  `,
  template: `
    <button :class="getButtonClasses()">
      <slot></slot>
    </button>
  `,
};

