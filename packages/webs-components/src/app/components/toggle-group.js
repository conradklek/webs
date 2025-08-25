import ToggleGroup from '../../gui/toggle-group';
import { ComponentWrapper } from '../../gui/utils';

export default {
  name: 'DemoToggleGroup',
  components: {
    ToggleGroup,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper
        componentName="Toggle Group"
        class="w-full flex flex-col space-y-4"
      >
        <div>
          <h3 class="font-semibold mb-2">Single Toggle</h3>
          <ToggleGroup type="single" defaultValue="a">
            <ToggleGroupItem value="a">A</ToggleGroupItem>
            <ToggleGroupItem value="b">B</ToggleGroupItem>
            <ToggleGroupItem value="c">C</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </ComponentWrapper>
    `;
  },
};
