import * as Checkbox from '../../gui/checkbox';
import { ComponentWrapper } from '../../gui/utils';

export default {
  name: 'DemoCheckbox',
  components: {
    ...Checkbox,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper
        componentName="Checkbox"
        class="w-full flex flex-col space-y-2"
      >
        <div class="flex items-center space-x-2">
          <Checkbox defaultChecked />
          <label class="text-sm font-medium leading-none">
            Accept terms and conditions
          </label>
        </div>
      </ComponentWrapper>
    `;
  },
};
