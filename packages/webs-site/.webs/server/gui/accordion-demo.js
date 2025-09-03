// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/accordion.webs
import { provide, inject, state, computed } from "@conradklek/webs";
var AccordionItem = {
  name: "accordion-item",
  props: {
    value: {
      type: String,
      required: true
    }
  },
  setup(props) {
    provide("itemValue", props.value);
  },
  template(html) {
    return html`
        <div class="w-full flex flex-col gap-1.5">
          <slot></slot>
        </div>
      `;
  }
};
var AccordionTrigger = {
  name: "accordion-trigger",
  setup() {
    const accordion = inject("accordion");
    const { toggle } = accordion || {};
    const value = inject("itemValue");
    return {
      handleClick: () => toggle && value && toggle(value)
    };
  },
  template(html) {
    return html`
        <h3>
          <button
            type="button"
            @click="handleClick"
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
  }
};
var AccordionContent = {
  name: "accordion-content",
  setup() {
    const accordion = inject("accordion");
    const { openItems } = accordion || {};
    const value = inject("itemValue");
    const isOpen = computed(() => openItems && openItems.has(value));
    return { isOpen };
  },
  template(html) {
    return html`
        <div w-if="isOpen" class="pb-3 pt-1">
          <slot></slot>
        </div>
      `;
  }
};
var accordion_default = {
  template: ``,
  style: ``,
  name: "accordion",
  components: {
    "accordion-item": AccordionItem,
    "accordion-trigger": AccordionTrigger,
    "accordion-content": AccordionContent
  },
  props: {
    type: {
      type: String,
      default: "single"
    },
    collapsible: {
      type: Boolean,
      default: true
    }
  },
  setup(props) {
    const openItems = state(new Set);
    function toggle(value) {
      if (props.type === "single") {
        if (openItems.has(value)) {
          if (props.collapsible) {
            openItems.delete(value);
          }
        } else {
          openItems.clear();
          openItems.add(value);
        }
      } else if (props.type === "multiple") {
        if (openItems.has(value)) {
          openItems.delete(value);
        } else {
          openItems.add(value);
        }
      }
    }
    provide("accordion", {
      openItems,
      toggle
    });
  },
  template(html) {
    return html`
        <div class="w-full flex flex-col items-start justify-start gap-3">
          <slot></slot>
        </div>
      `;
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/accordion-demo.webs
var accordion_demo_default = {
  template: `
  <accordion type="single" collapsible>
    <accordion-item value="item-1">
      <accordion-trigger>Is it accessible?</accordion-trigger>
      <accordion-content
        >Yes. It adheres to the WAI-ARIA design pattern.</accordion-content
      >
    </accordion-item>
    <accordion-item value="item-2">
      <accordion-trigger>Is it styled?</accordion-trigger>
      <accordion-content
        >Yes. It comes with default styles that matches the other
        components.</accordion-content
      >
    </accordion-item>
    <accordion-item value="item-3">
      <accordion-trigger>Is it animated?</accordion-trigger>
      <accordion-content
        >Yes. It's animated by default, but you can disable it if you
        prefer.</accordion-content
      >
    </accordion-item>
  </accordion>
`,
  style: ``,
  name: "accordion-demo",
  components: {
    accordion: accordion_default,
    ...accordion_default.components
  }
};
export {
  accordion_demo_default as default
};
