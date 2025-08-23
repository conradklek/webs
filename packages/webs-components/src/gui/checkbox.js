const Checkbox = {
  name: "Checkbox",
  props: {
    defaultChecked: {
      type: Boolean,
      default: false,
    },
  },
  state({ props }) {
    return {
      isChecked: props.defaultChecked,
    };
  },
  methods: {
    toggle() {
      this.isChecked = !this.isChecked;
    },
  },
  template(html) {
    return html`
      <button
        type="button"
        role="checkbox"
        :aria-checked="isChecked"
        @click="toggle"
        :data-state="isChecked ? 'checked' : 'unchecked'"
        class="peer h-4 w-4 shrink-0 rounded-sm border border-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-muted data-[state=checked]:bg-blue-600 data-[state=checked]:border-transparent"
      ></button>
    `;
  },
};

export default Checkbox;
