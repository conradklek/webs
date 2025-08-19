import { accordion } from "./index.js";

export default {
  name: "AccordionContent",
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
    <div w-if="accordion.is_open(value)" class="contents">
      <slot></slot>
    </div>
  `,
};
