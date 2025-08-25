import ToggleGroup from '../../gui/toggle-group';

const DemoToggleGroup = {
  name: 'DemoToggleGroup',
  components: {
    ToggleGroup,
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col space-y-4">
        <div>
          <h3 class="font-semibold mb-2">Single Toggle</h3>
          <ToggleGroup type="single" defaultValue="a">
            <ToggleGroupItem value="a">A</ToggleGroupItem>
            <ToggleGroupItem value="b">B</ToggleGroupItem>
            <ToggleGroupItem value="c">C</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div>
          <h3 class="font-semibold mb-2">Multiple Toggles</h3>
          <ToggleGroup type="multiple" defaultValue='["a", "b"]'>
            <ToggleGroupItem value="a">A</ToggleGroupItem>
            <ToggleGroupItem value="b">B</ToggleGroupItem>
            <ToggleGroupItem value="c">C</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    `;
  },
};

export default {
  name: 'ToggleGroupPage',
  components: {
    DemoToggleGroup,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoToggleGroup />
      </div>
    </div>`;
  },
};
