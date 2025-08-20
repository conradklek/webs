const Toggle = {
  name: "Toggle",
  props: {
    variant: {
      type: String,
      default: "default",
    },
    size: {
      type: String,
      default: "default",
    },
    defaultPressed: {
      type: Boolean,
      default: false,
    },
  },
  setup({ props, reactive }) {
    const state = reactive({
      is_on: props.defaultPressed,
    });

    const toggle = () => {
      state.is_on = !state.is_on;
    };

    const getClasses = () => {
      const base =
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground";

      const variants = {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
      };

      const sizes = {
        default: "h-10 px-3 min-w-10",
        sm: "h-9 px-2.5 min-w-9",
        lg: "h-11 px-5 min-w-11",
      };

      return `${base} ${variants[props.variant] || variants.default} ${sizes[props.size] || sizes.default}`;
    };

    return {
      state,
      toggle,
      getClasses,
    };
  },
  template: `
    <button
      type="button"
      @click="toggle"
      :aria-pressed="state.is_on"
      :data-state="state.is_on ? 'on' : 'off'"
      :class="getClasses()"
    >
      <slot></slot>
    </button>
  `,
};

export default Toggle;
