const Accordion = {
  name: "Accordion",
  props: {
    type: {
      type: String,
      default: "single",
    },
    collapsible: {
      type: Boolean,
      default: true,
    },
  },
  state() {
    return {
      openItems: new Set(),
    };
  },
  setup({ provide }) {
    provide("accordion", {
      toggle: this.toggle,
      is_open: this.is_open,
    });
  },
  methods: {
    toggle(value) {
      const newOpenItems = new Set(this.openItems);
      if (this.type === "single") {
        if (newOpenItems.has(value)) {
          if (this.collapsible) {
            newOpenItems.delete(value);
          }
        } else {
          newOpenItems.clear();
          newOpenItems.add(value);
        }
      } else if (this.type === "multiple") {
        if (newOpenItems.has(value)) {
          newOpenItems.delete(value);
        } else {
          newOpenItems.add(value);
        }
      }
      this.openItems = newOpenItems;
    },
    is_open(value) {
      return this.openItems.has(value);
    },
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col items-start justify-start gap-3">
        <slot></slot>
      </div>
    `;
  },
};

const AccordionItem = {
  name: "AccordionItem",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup({ props, provide }) {
    provide("itemValue", props.value);
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col gap-1.5">
        <slot></slot>
      </div>
    `;
  },
};

const AccordionTrigger = {
  name: "AccordionTrigger",
  state({ inject }) {
    return {
      accordion: inject("accordion"),
      value: inject("itemValue"),
    };
  },
  template(html) {
    return html`
      <h3>
        <button
          type="button"
          @click="accordion.toggle(value)"
          class="w-full flex flex-row items-start justify-start cursor-pointer"
        >
          <span
            class="flex-1 flex flex-row items-start justify-start font-medium"
          >
            <slot></slot>
          </span>
        </button>
      </h3>
    `;
  },
};

const AccordionContent = {
  name: "AccordionContent",
  state({ inject }) {
    return {
      accordion: inject("accordion"),
      value: inject("itemValue"),
    };
  },
  template(html) {
    return html`
      <div w-if="accordion.is_open(value)" class="contents">
        <div class="pb-3 pt-1">
          <slot></slot>
        </div>
      </div>
    `;
  },
};

Accordion.components = {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
};

export default Accordion;
