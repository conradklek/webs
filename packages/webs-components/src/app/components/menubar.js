import * as Menubar from '../../gui/menubar';
import { ComponentWrapper } from '../../gui/utils';

export default {
  name: 'DemoMenubar',
  components: {
    ...Menubar,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper class="w-full">
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
              <MenubarItem disabled>New Incognito Window</MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Share</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Email link</MenubarItem>
                  <MenubarItem>Messages</MenubarItem>
                  <MenubarItem>Notes</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSeparator />
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
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Find</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Search the web</MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>Find...</MenubarItem>
                  <MenubarItem>Find Next</MenubarItem>
                  <MenubarItem>Find Previous</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSeparator />
              <MenubarItem
                >Cut <MenubarShortcut>⌘X</MenubarShortcut></MenubarItem
              >
              <MenubarItem
                >Copy <MenubarShortcut>⌘C</MenubarShortcut></MenubarItem
              >
              <MenubarItem
                >Paste <MenubarShortcut>⌘V</MenubarShortcut></MenubarItem
              >
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu value="view">
            <MenubarTrigger>View</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                >Reload <MenubarShortcut>⌘R</MenubarShortcut></MenubarItem
              >
              <MenubarItem
                >Force Reload
                <MenubarShortcut>⇧⌘R</MenubarShortcut></MenubarItem
              >
              <MenubarItem>Toggle Developer Tools</MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                >Actual Size <MenubarShortcut>⌘0</MenubarShortcut></MenubarItem
              >
              <MenubarItem
                >Zoom In <MenubarShortcut>⌘+</MenubarShortcut></MenubarItem
              >
              <MenubarItem
                >Zoom Out <MenubarShortcut>⌘-</MenubarShortcut></MenubarItem
              >
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </ComponentWrapper>
    `;
  },
};
