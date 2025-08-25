import * as Accordion from '../../gui/accordion';

const DemoAccordion = {
  name: 'DemoAccordion',
  components: {
    ...Accordion,
  },
  template(html) {
    return html`<div class="w-full">
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Is it accessible?</AccordionTrigger>
          <AccordionContent
            >Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent
          >
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Is it styled?</AccordionTrigger>
          <AccordionContent
            >Yes. It comes with default styles that matches the other
            components.</AccordionContent
          >
        </AccordionItem>
        <AccordionItem value="item-3">
          <AccordionTrigger>Is it animated?</AccordionTrigger>
          <AccordionContent
            >Yes. It's animated by default, but you can disable it if you
            prefer.</AccordionContent
          >
        </AccordionItem>
      </Accordion>
    </div> `;
  },
};

export default {
  name: 'AccordionPage',
  components: {
    DemoAccordion,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoAccordion />
      </div>
    </div>`;
  },
};
