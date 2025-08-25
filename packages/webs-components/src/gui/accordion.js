import { provide, inject, useState } from '@conradklek/webs';

export const AccordionItem = {
  name: 'AccordionItem',
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    provide('itemValue', props.value);
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col gap-1.5">
        <slot></slot>
      </div>
    `;
  },
};

export const AccordionTrigger = {
  name: 'AccordionTrigger',
  setup() {
    const accordion = inject('accordion');
    const value = inject('itemValue');
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

export const AccordionContent = {
  name: 'AccordionContent',
  setup() {
    const accordion = inject('accordion');
    const value = inject('itemValue');
    return { accordion, value };
  },
  template(html) {
    return html`
      <div w-if="accordion && accordion.is_open(value)" class="contents">
        <div class="pb-3 pt-1">
          <slot></slot>
        </div>
      </div>
    `;
  },
};

export const Accordion = {
  name: 'Accordion',
  components: {
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
  },
  props: {
    type: {
      type: String,
      default: 'single',
    },
    collapsible: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    const openItems = useState(new Set());

    function toggle(value) {
      const newOpenItems = new Set(openItems.value);
      if (props.type === 'single') {
        if (newOpenItems.has(value)) {
          if (props.collapsible) {
            newOpenItems.delete(value);
          }
        } else {
          newOpenItems.clear();
          newOpenItems.add(value);
        }
      } else if (props.type === 'multiple') {
        if (newOpenItems.has(value)) {
          newOpenItems.delete(value);
        } else {
          newOpenItems.add(value);
        }
      }
      openItems.value = newOpenItems;
    }

    function is_open(value) {
      return openItems.value.has(value);
    }

    provide('accordion', {
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
