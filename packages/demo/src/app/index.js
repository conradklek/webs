import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";
import Card from "../gui/card/index.js";
import Button from "../gui/button.js";
import Accordion from "../gui/accordion/index.js";

export const middleware = [use_logger];

export default {
  name: "Home",
  state() {
    return {
      count: 0,
    };
  },
  setup() {
    return {
      session: use_session,
    };
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  styles: `
    @theme {
      --color-primary: #1e40af;
    }
    @layer base {
      a { @apply underline cursor-pointer active:opacity-50 whitespace-nowrap; }
    }
  `,
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1>webs</h1>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <div w-if="!session.user.username" class="flex flex-row items-center justify-start gap-4">
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
          <div w-else class="flex flex-row items-center justify-start gap-4">
            <button type="button" @click="session.logout()" class="bg-primary text-white px-1.5 rounded-md cursor-pointer active:opacity-50">Logout</button>
            <span>|</span>
            <a href="/profile">Profile &rarr;</a>
          </div>
        </div>
      </div>
      <div w-if="session.user.username" class="flex-1 flex flex-col items-start justify-start gap-2">
        <p>Welcome back, @{{ session.user.username }}!</p>
      </div>
      <div w-else class="flex-1 flex flex-col items-start justify-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription>Deploy your new project in one-click.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This is the main content area of the card. You can place any HTML here.</p>
          </CardContent>
          <CardFooter>
            <Button type="button" @click="increment">
              This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!
            </Button>
          </CardFooter>
        </Card>
        <Accordion type="multiple" collapsible="true">
          <AccordionItem value="item1">
            <AccordionTrigger value="item1">Item 1</AccordionTrigger>
            <AccordionContent value="item1">Content 1</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item2">
            <AccordionTrigger value="item2">Item 2</AccordionTrigger>
            <AccordionContent value="item2">Content 2</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  `,
  components: {
    Accordion,
    Card,
    Button,
  },
};
