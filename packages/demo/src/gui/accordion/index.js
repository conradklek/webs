import { create_store } from "@conradklek/webs";
import AccordionItem from "./accordion-item.js";
import AccordionTrigger from "./accordion-trigger.js";
import AccordionContent from "./accordion-content.js";

export const accordion = create_store({
  state: () => ({
    openItems: new Set(),
    type: "multiple",
    collapsible: true,
  }),
  actions: {
    toggle(value) {
      if (this.type === "single") {
        if (this.openItems.has(value)) {
          if (this.collapsible) {
            this.openItems.delete(value);
          }
        } else {
          this.openItems.clear();
          this.openItems.add(value);
        }
      } else if (this.type === "multiple") {
        if (this.openItems.has(value)) {
          this.openItems.delete(value);
        } else {
          this.openItems.add(value);
        }
      }
    },
  },
  getters: {
    is_open() {
      return (value) => this.openItems.has(value);
    },
  },
});

export default {
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
  template: `
    <div class="w-full flex flex-col items-start justify-start gap-3">
      <slot></slot>
    </div>
  `,
  components: {
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
  },
};
