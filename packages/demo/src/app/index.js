import { use_logger } from "../use/logger.js";

import Breadcrumb from "../gui/breadcrumb.js";
import Accordion from "../gui/accordion.js";
import Menubar from "../gui/menubar.js";
import Tabs from "../gui/tabs.js";
import Card from "../gui/card.js";
import Toggle from "../gui/toggle.js";
import ToggleGroup from "../gui/toggle-group.js";

export const middleware = [use_logger];

export default {
  name: "Home",
  state() {
    return {
      count: 0,
      toggleDefaults: ["bold", "italic"],
    };
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-8"
    >
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1>webs</h1>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <div class="flex flex-row items-center justify-start gap-4">
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
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
      <div class="flex-1 flex flex-col items-start justify-start gap-6">
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
              's' }}.
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

        <div class="flex flex-col items-start gap-4">
          <h2 class="text-lg font-semibold">Toggles</h2>
          <div class="flex items-center gap-4">
            <Toggle variant="outline">Toggle Me</Toggle>
            <Toggle variant="default" size="sm">Small</Toggle>
            <Toggle variant="outline" size="lg">Large</Toggle>
          </div>

          <h3 class="text-md font-semibold mt-4">Toggle Group (Single)</h3>
          <ToggleGroup type="single" variant="outline" defaultValue="center">
            <ToggleGroupItem value="left">Left</ToggleGroupItem>
            <ToggleGroupItem value="center">Center</ToggleGroupItem>
            <ToggleGroupItem value="right">Right</ToggleGroupItem>
          </ToggleGroup>

          <h3 class="text-md font-semibold mt-4">Toggle Group (Multiple)</h3>
          <ToggleGroup
            type="multiple"
            variant="default"
            :defaultValue="toggleDefaults"
          >
            <ToggleGroupItem value="bold"><b>B</b></ToggleGroupItem>
            <ToggleGroupItem value="italic"><i>I</i></ToggleGroupItem>
            <ToggleGroupItem value="underline"><u>U</u></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </div>`;
  },
  components: {
    Accordion,
    Breadcrumb,
    Card,
    Tabs,
    Menubar,
    Toggle,
    ToggleGroup,
  },
};
