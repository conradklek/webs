import * as RadioGroup from '../../gui/radio-group';
import { ComponentWrapper } from '../../gui/utils';

export default {
  name: 'DemoRadioGroup',
  components: {
    ...RadioGroup,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper
        componentName="Radio Group"
        class="w-full flex flex-col space-y-2"
      >
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
      </ComponentWrapper>
    `;
  },
};
