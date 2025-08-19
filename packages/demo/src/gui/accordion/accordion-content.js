export default {
  name: "AccordionContent",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  setup(_, { inject }) {
    const accordion = inject("accordion");
    return { accordion };
  },
  template: `
    <div w-if="accordion.is_open(value)" class="contents">
      <div class="pb-3 pt-1">
        <slot></slot>
      </div>
    </div>
  `,
};
