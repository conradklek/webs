import Accordion from "../gui/accordion.js";
import Breadcrumb from "../gui/breadcrumb.js";
import Card from "../gui/card.js";
import Checkbox from "../gui/checkbox.js";
import Menubar from "../gui/menubar.js";
import Modal from "../gui/modal.js";
import RadioGroup from "../gui/radio-group.js";
import Tabs from "../gui/tabs.js";
import Switch from "../gui/switch.js";
import ToggleGroup from "../gui/toggle-group.js";

const AccordionPage = {
  name: "AccordionPage",
  components: { Accordion },
  template(html) {
    return html`
      <div class="w-full">
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
          <AccordionItem value="item3">
            <AccordionTrigger>Is it animated?</AccordionTrigger>
            <AccordionContent
              >Yes. It's animated by default, but you can disable it if you
              prefer.</AccordionContent
            >
          </AccordionItem>
        </Accordion>
      </div>
    `;
  },
};

const ModalPage = {
  name: "ModalPage",
  components: { Modal },
  template(html) {
    return html`
      <div class="w-full">
        <Modal>
          <ModalTrigger class="btn btn-default btn-size-default"
            >Edit Profile</ModalTrigger
          >
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Edit profile</ModalTitle>
              <ModalDescription>
                Make changes to your profile here. Click save when you're done.
              </ModalDescription>
            </ModalHeader>
            <div class="grid gap-4 py-4">
              <div class="grid grid-cols-4 items-center gap-4">
                <label for="name" class="text-right">Name</label>
                <input id="name" value="Pedro Duarte" class="col-span-3" />
              </div>
              <div class="grid grid-cols-4 items-center gap-4">
                <label for="username" class="text-right">Username</label>
                <input id="username" value="@peduarte" class="col-span-3" />
              </div>
            </div>
            <ModalFooter>
              <ModalClose class="btn btn-default btn-size-lg">
                Save changes
              </ModalClose>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    `;
  },
};

const BreadcrumbPage = {
  name: "BreadcrumbPage",
  components: { Breadcrumb },
  template(html) {
    return html`
      <div class="w-full">
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
      </div>
    `;
  },
};

const CardPage = {
  name: "CardPage",
  components: { Card },
  state() {
    return {
      count: 0,
    };
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  template(html) {
    return html`
      <div class="w-full">
        <Card class="w-[350px]">
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
              @click="increment"
              class="btn btn-default btn-size-default"
            >
              Clicked {{ count }} time{{ count === 1 ? '' : 's' }}.
            </button>
          </CardFooter>
        </Card>
      </div>
    `;
  },
};

const CheckboxPage = {
  name: "CheckboxPage",
  components: { Checkbox },
  template(html) {
    return html`
      <div class="w-full items-top flex space-x-2">
        <Checkbox id="terms1"></Checkbox>
        <div class="grid gap-1.5 leading-none">
          <label
            for="terms1"
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Accept terms and conditions
          </label>
          <p class="text-sm text-muted-foreground">
            You agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    `;
  },
};

const MenubarPage = {
  name: "MenubarPage",
  components: { Menubar },
  template(html) {
    return html`
      <div class="w-full">
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
                >Force Reload
                <MenubarShortcut>⇧⌘R</MenubarShortcut></MenubarItem
              >
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>
    `;
  },
};

const RadioGroupPage = {
  name: "RadioGroupPage",
  components: { RadioGroup },
  template(html) {
    return html`
      <div class="w-full">
        <RadioGroup defaultValue="comfortable">
          <div class="flex items-center space-x-4">
            <RadioGroupItem value="default" id="r1"></RadioGroupItem>
            <label for="r1">Default</label>
          </div>
          <div class="flex items-center space-x-4">
            <RadioGroupItem value="comfortable" id="r2"></RadioGroupItem>
            <label for="r2">Comfortable</label>
          </div>
          <div class="flex items-center space-x-4">
            <RadioGroupItem value="compact" id="r3"></RadioGroupItem>
            <label for="r3">Compact</label>
          </div>
        </RadioGroup>
      </div>
    `;
  },
};

const TabsPage = {
  name: "TabsPage",
  components: { Tabs },
  template(html) {
    return html`
      <div class="w-full flex flex-col items-start gap-4">
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

const SwitchPage = {
  name: "SwitchPage",
  components: { Switch },
  template(html) {
    return html`
      <div class="w-full flex flex-row items-center gap-2">
        <Switch id="toggle-switch" label="Switch Me"></Switch>
      </div>
    `;
  },
};

const ToggleGroupPage = {
  name: "ToggleGroupPage",
  components: { ToggleGroup },
  state() {
    return {
      toggleDefaults: ["bold", "italic"],
    };
  },
  template(html) {
    return html`
      <div class="w-full flex flex-col items-start gap-4">
        <ToggleGroup type="single" variant="outline" defaultValue="center">
          <ToggleGroupItem value="left">Left</ToggleGroupItem>
          <ToggleGroupItem value="center">Center</ToggleGroupItem>
          <ToggleGroupItem value="right">Right</ToggleGroupItem>
        </ToggleGroup>
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
    `;
  },
};

const componentList = [
  { path: "accordion", name: "Accordion" },
  { path: "breadcrumb", name: "Breadcrumb" },
  { path: "card", name: "Card" },
  { path: "checkbox", name: "Checkbox" },
  { path: "modal", name: "Modal" },
  { path: "menubar", name: "Menubar" },
  { path: "radio-group", name: "Radio Group" },
  { path: "tabs", name: "Tabs" },
  { path: "switch", name: "Switch" },
  { path: "toggle-group", name: "Toggle Group" },
];

const Components = {
  name: "Components",
  components: {
    AccordionPage,
    BreadcrumbPage,
    CardPage,
    CheckboxPage,
    ModalPage,
    MenubarPage,
    RadioGroupPage,
    TabsPage,
    SwitchPage,
    ToggleGroupPage,
  },
  props: {
    params: {
      type: Object,
      default: () => ({}),
    },
  },
  setup({ props }) {
    const currentIndex = componentList.findIndex(
      (c) => c.path === props.params.component,
    );

    const prevComponent =
      currentIndex > 0 ? componentList[currentIndex - 1] : null;
    const nextComponent =
      currentIndex < componentList.length - 1
        ? componentList[currentIndex + 1]
        : null;

    return {
      prevComponent,
      nextComponent,
    };
  },
  template(html) {
    return html`<main
      class="w-full min-h-dvh p-8 flex flex-col items-start justify-start gap-6"
    >
      <header class="w-full flex flex-row items-center justify-start gap-2">
        <a href="/" class="text-blue-600 hover:underline">webs.site</a>
        <div class="ml-auto text-muted-foreground">components</div>
        <span>|</span>
        <div>{{ params.component }}</div>
      </header>
      <article
        class="flex-1 w-full h-full py-6 flex flex-col items-start justify-start gap-4"
      >
        <AccordionPage w-if="params.component === 'accordion'"></AccordionPage>
        <BreadcrumbPage
          w-if="params.component === 'breadcrumb'"
        ></BreadcrumbPage>
        <CardPage w-if="params.component === 'card'"></CardPage>
        <CheckboxPage w-if="params.component === 'checkbox'"></CheckboxPage>
        <MenubarPage w-if="params.component === 'menubar'"></MenubarPage>
        <ModalPage w-if="params.component === 'modal'"></ModalPage>
        <RadioGroupPage
          w-if="params.component === 'radio-group'"
        ></RadioGroupPage>
        <SwitchPage w-if="params.component === 'switch'"></SwitchPage>
        <TabsPage w-if="params.component === 'tabs'"></TabsPage>
        <ToggleGroupPage
          w-if="params.component === 'toggle-group'"
        ></ToggleGroupPage>
      </article>
      <footer
        class="w-full mt-auto flex flex-row items-center justify-between gap-4"
      >
        <div class="w-full flex flex-row items-center justify-start">
          <a
            w-if="prevComponent"
            :href="'/components/' + prevComponent.path"
            class="text-blue-600 hover:underline"
            >&larr; {{ prevComponent.name }}</a
          >
        </div>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <a
            w-if="nextComponent"
            :href="'/components/' + nextComponent.path"
            class="text-blue-600 hover:underline"
            >{{ nextComponent.name }} &rarr;</a
          >
        </div>
      </footer>
    </main> `;
  },
};

export default Components;
