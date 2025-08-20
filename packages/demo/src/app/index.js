import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";
import Breadcrumb from "../gui/breadcrumb.js";
import Accordion from "../gui/accordion.js";
import Menubar from "../gui/menubar.js";
import Tabs from "../gui/tabs.js";
import Card from "../gui/card.js";

export const middleware = [use_logger];

export default {
  name: "Home",
  state() {
    return {
      count: 0,
      username: "",
      email: "",
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
    handleInput(event) {
      const { name, value } = event.target;
      this[name] = value;
      console.log(`${name} updated to: ${value}`);
    },
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-8"
    >
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1>webs</h1>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <div
            w-if="!session.user.username"
            class="flex flex-row items-center justify-start gap-4"
          >
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
          <div w-else class="flex flex-row items-center justify-start gap-4">
            <button
              type="button"
              @click="session.logout()"
              class="btn btn-default btn-size-default"
            >
              Logout
            </button>
            <span>|</span>
            <a href="/profile">Profile &rarr;</a>
          </div>
        </div>
      </div>

      <Menubar>
        <MenubarMenu value="file">
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              >New Tab <MenubarShortcut>⌘T</MenubarShortcut></MenubarItem
            >
            <MenubarItem
              >New Window <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem
            >
            <MenubarItem>New Incognito Window</MenubarItem>
            <MenubarSeparator></MenubarSeparator>
            <MenubarSub>
              <MenubarSubTrigger>Share</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Email link</MenubarItem>
                <MenubarItem>Copy link</MenubarItem>
                <MenubarItem>Notes</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator></MenubarSeparator>
            <MenubarItem
              >Print... <MenubarShortcut>⌘P</MenubarShortcut></MenubarItem
            >
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="edit">
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              >Undo <MenubarShortcut>⌘Z</MenubarShortcut></MenubarItem
            >
            <MenubarItem
              >Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut></MenubarItem
            >
            <MenubarSeparator></MenubarSeparator>
            <MenubarItem>Cut</MenubarItem>
            <MenubarItem>Copy</MenubarItem>
            <MenubarItem>Paste</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="view">
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Show Bookmarks Bar</MenubarItem>
            <MenubarItem>Show Full URLs</MenubarItem>
            <MenubarSeparator></MenubarSeparator>
            <MenubarItem
              >Reload <MenubarShortcut>⌘R</MenubarShortcut></MenubarItem
            >
            <MenubarItem
              >Force Reload <MenubarShortcut>⇧⌘R</MenubarShortcut></MenubarItem
            >
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div
        w-if="session.user.username"
        class="flex-1 flex flex-col items-start justify-start gap-2"
      >
        <p>Welcome back, @{{ session.user.username }}!</p>
      </div>
      <div w-else class="flex-1 flex flex-col items-start justify-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription
              >Deploy your new project in one-click.</CardDescription
            >
          </CardHeader>
          <CardContent>
            <p>
              This is the main content area of the card. You can place any HTML
              here.
            </p>
          </CardContent>
          <CardFooter>
            <button
              type="button"
              @click="increment"
              class="btn btn-default btn-size-default"
            >
              This button has been clicked {{ count }} time{{ count === 1 ? '' :
              's' }}!
            </button>
          </CardFooter>
        </Card>
        <Accordion type="multiple">
          <AccordionItem value="item1">
            <AccordionTrigger>Is it accessible?</AccordionTrigger>
            <AccordionContent
              >Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent
            >
          </AccordionItem>
          <AccordionItem value="item2">
            <AccordionTrigger>Is it styled?</AccordionTrigger>
            <AccordionContent
              >Yes. It comes with default styles that matches the other
              components' aesthetic.</AccordionContent
            >
          </AccordionItem>
        </Accordion>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator></BreadcrumbSeparator>
            <BreadcrumbEllipsis></BreadcrumbEllipsis>
            <BreadcrumbSeparator></BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
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
    </div>`;
  },
  components: {
    Accordion,
    Breadcrumb,
    Card,
    Tabs,
    Menubar,
  },
};
