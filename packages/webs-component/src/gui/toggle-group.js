const ToggleGroupItem = {
  name: "ToggleGroupItem",
  props: {
    value: {
      type: String,
      required: true,
    },
    variant: {
      type: String,
    },
    size: {
      type: String,
    },
  },
  state({ props, inject }) {
    const toggleGroup = inject("toggleGroup");
    return {
      toggleGroup,
      value: props.value,
    };
  },
  methods: {
    getClasses() {
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
      const variant = this.variant || this.toggleGroup.variant;
      const size = this.size || this.toggleGroup.size;
      return `${base} ${variants[variant] || variants.default} ${sizes[size] || sizes.default
        }`;
    },
  },
  template(html) {
    return html`
      <button
        type="button"
        role="radio"
        :aria-checked="toggleGroup.is_on(value)"
        @click="toggleGroup.toggle(value)"
        :data-state="toggleGroup.is_on(value) ? 'on' : 'off'"
        :class="getClasses()"
      >
        <slot></slot>
      </button>
    `;
  },
};

const ToggleGroup = {
  name: "ToggleGroup",
  props: {
    type: {
      type: String,
      default: "single",
    },
    variant: {
      type: String,
      default: "default",
    },
    size: {
      type: String,
      default: "default",
    },
    defaultValue: {
      type: [String, Array],
    },
  },
  state({ props }) {
    return {
      value:
        props.type === "multiple"
          ? new Set(props.defaultValue || [])
          : props.defaultValue,
    };
  },
  setup({ props, provide }) {
    provide("toggleGroup", {
      toggle: this.toggle,
      is_on: this.is_on,
      variant: props.variant,
      size: props.size,
    });
  },
  methods: {
    toggle(itemValue) {
      if (this.type === "multiple") {
        const newValue = new Set(this.value);
        if (newValue.has(itemValue)) {
          newValue.delete(itemValue);
        } else {
          newValue.add(itemValue);
        }
        this.value = newValue;
      } else {
        this.value = this.value === itemValue ? null : itemValue;
      }
    },
    is_on(itemValue) {
      if (this.type === "multiple") {
        return this.value.has(itemValue);
      }
      return this.value === itemValue;
    },
  },
  template(html) {
    return html`
      <div role="group" class="flex items-center justify-center gap-1">
        <slot></slot>
      </div>
    `;
  },
};

ToggleGroup.components = {
  ToggleGroupItem,
};

export default ToggleGroup;
