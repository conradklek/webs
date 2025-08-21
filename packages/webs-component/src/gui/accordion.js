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
  state({ props, provide, reactive }) {
    const state = reactive({
      openItems: new Set(),
    });

    const toggle = (value) => {
      if (props.type === "single") {
        if (state.openItems.has(value)) {
          if (props.collapsible) {
            state.openItems.delete(value);
          }
        } else {
          state.openItems.clear();
          state.openItems.add(value);
        }
      } else if (props.type === "multiple") {
        if (state.openItems.has(value)) {
          state.openItems.delete(value);
        } else {
          state.openItems.add(value);
        }
      }
    };

    const is_open = (value) => {
      return state.openItems.has(value);
    };

    provide("accordion", {
      toggle,
      is_open,
    });
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
  state({ props, provide }) {
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
    const accordion = inject("accordion");
    const value = inject("itemValue");
    return { accordion, value };
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
    const accordion = inject("accordion");
    const value = inject("itemValue");
    return { accordion, value };
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
