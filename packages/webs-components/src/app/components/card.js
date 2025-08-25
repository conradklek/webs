import { useState } from '@conradklek/webs';
import { ComponentWrapper } from '../../gui/utils';
import * as Card from '../../gui/card';

export default {
  name: 'DemoCard',
  components: {
    ...Card,
    ComponentWrapper,
  },
  setup() {
    const count = useState(0);
    return { count };
  },
  template(html) {
    return html`
      <ComponentWrapper componentName="Card" class="w-full">
        <Card class="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription
              >Deploy your new project in one-click.</CardDescription
            >
          </CardHeader>
          <CardContent>
            <p>This is the main content area of the card.</p>
          </CardContent>
          <CardFooter class="flex justify-between">
            <button
              type="button"
              @click="count++"
              class="w-full btn btn-default btn-size-default"
            >
              Clicked {{ count }} time{{ count === 1 ? '' : 's' }}.
            </button>
          </CardFooter>
        </Card>
      </ComponentWrapper>
    `;
  },
};
