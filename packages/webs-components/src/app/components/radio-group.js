import * as RadioGroup from '../../gui/radio-group';

const DemoRadioGroup = {
  name: 'DemoRadioGroup',
  components: {
    ...RadioGroup,
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col space-y-2">
        <RadioGroup defaultValue="comfortable">
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="default" id="r1" />
            <label for="r1">Default</label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="comfortable" id="r2" />
            <label for="r2">Comfortable</label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="compact" id="r3" />
            <label for="r3">Compact</label>
          </div>
        </RadioGroup>
      </div>
    `;
  },
};

export default {
  name: 'RadioGroupPage',
  components: {
    DemoRadioGroup,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoRadioGroup />
      </div>
    </div>`;
  },
};
