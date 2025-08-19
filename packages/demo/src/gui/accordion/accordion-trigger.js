import { accordion } from "./index.js";

export default {
  name: "AccordionTrigger",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup() {
    return { accordion };
  },
  template: `
    <h3>
      <button 
        type="button" 
        @click="accordion.toggle(value)"
        class="w-full flex flex-row items-start justify-start cursor-pointer"
      >
        <span class="flex-1 flex flex-row items-start justify-start font-medium">
          <slot></slot>
        </span>
        <span class="accordion-chevron">
          {{ accordion.is_open(value) ? '-' : '+' }}
        </span>
      </button>
    </h3>
  `,
};
