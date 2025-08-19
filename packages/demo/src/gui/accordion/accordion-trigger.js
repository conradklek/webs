export default {
  name: "AccordionTrigger",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup(props, { inject }) {
    const accordion = inject("accordion");
    console.log(
      `[AccordionTrigger for value='${props.value}'] Injected context:`,
      accordion,
    );
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
