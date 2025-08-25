import { ComponentWrapper } from '../../gui/utils';
import * as Tabs from '../../gui/tabs';

export default {
  name: 'DemoTabs',
  components: {
    ...Tabs,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper class="w-full">
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
      </ComponentWrapper>
    `;
  },
};
