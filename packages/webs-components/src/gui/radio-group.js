const RadioGroupItem = {
  name: "RadioGroupItem",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  state({ props, inject }) {
    const radioGroup = inject("radioGroup");
    return {
      radioGroup,
      value: props.value,
    };
  },
  template(html) {
    return html`
      <button
        type="button"
        role="radio"
        :aria-checked="radioGroup.is_selected(value)"
        :data-state="radioGroup.is_selected(value) ? 'checked' : 'unchecked'"
        @click="radioGroup.select(value)"
        class="aspect-square h-4 w-4 rounded-full border border-border text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div
          w-if="radioGroup.is_selected(value)"
          class="flex items-center justify-center"
        >
          <div class="h-2.5 w-2.5 rounded-full bg-current fill-current"></div>
        </div>
      </button>
    `;
  },
};

const RadioGroup = {
  name: "RadioGroup",
  props: {
    defaultValue: {
      type: String,
    },
  },
  state({ props }) {
    return {
      selectedValue: props.defaultValue,
    };
  },
  setup({ provide }) {
    provide("radioGroup", {
      select: this.select,
      is_selected: this.is_selected,
    });
  },
  methods: {
    select(value) {
      this.selectedValue = value;
    },
    is_selected(value) {
      return this.selectedValue === value;
    },
  },
  template(html) {
    return html`
      <div role="radiogroup" class="flex flex-col gap-2">
        <slot></slot>
      </div>
    `;
  },
};

RadioGroup.components = {
  RadioGroupItem,
};

export default RadioGroup;
