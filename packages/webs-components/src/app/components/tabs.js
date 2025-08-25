import * as Tabs from '../../gui/tabs';

const DemoTabs = {
  name: 'DemoTabs',
  components: {
    ...Tabs,
  },
  template(html) {
    return html`
      <div class="w-full">
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            Make changes to your account here.
          </TabsContent>
          <TabsContent value="password">
            Change your password here.
          </TabsContent>
        </Tabs>
      </div>
    `;
  },
};

export default {
  name: 'TabsPage',
  components: {
    DemoTabs,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="w-full flex flex-col items-start justify-start gap-4">
        <DemoTabs />
      </div>
    </div>`;
  },
};
