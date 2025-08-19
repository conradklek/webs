import { reactive } from "@conradklek/webs";

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
  setup(props, { provide }) {
    const state = reactive({
      openItems: new Set(),
    });

    const toggle = (value) => {
      console.log(
        `[Accordion] Toggling value: '${value}'. Current state:`,
        Array.from(state.openItems),
      );

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
  template: `
    <div class="w-full flex flex-col items-start justify-start gap-3">
      <slot></slot>
    </div>
  `,
};
