import { useState } from '@conradklek/webs';

import * as Card from '../../gui/card';

const DemoCard = {
  name: 'DemoCard',
  components: {
    ...Card,
  },
  setup() {
    const count = useState(0);
    return { count };
  },
  template(html) {
    return html`
      <div class="w-full">
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
      </div>
    `;
  },
};

export default {
  name: 'CardPage',
  components: {
    DemoCard,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoCard />
      </div>
    </div>`;
  },
};
