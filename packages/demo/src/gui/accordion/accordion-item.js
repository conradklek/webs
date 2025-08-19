export default {
  name: "AccordionItem",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  template: `
    <div class="w-full flex flex-col gap-1.5">
      <slot></slot>
    </div>
  `,
};
