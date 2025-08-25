import * as Checkbox from '../../gui/checkbox';

const DemoCheckbox = {
  name: 'DemoCheckbox',
  components: {
    ...Checkbox,
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col space-y-2">
        <div class="flex items-center space-x-2">
          <Checkbox defaultChecked />
          <label class="text-sm font-medium leading-none">
            Accept terms and conditions
          </label>
        </div>
      </div>
    `;
  },
};

export default {
  name: 'CheckboxPage',
  components: {
    DemoCheckbox,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoCheckbox />
      </div>
    </div>`;
  },
};
