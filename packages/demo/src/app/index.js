export default {
  name: "Home",
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <h1 class="font-medium">webs.site</h1>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <a href="/login">Login</a>
          <span>|</span>
          <a href="/signup">Signup</a>
        </div>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <h2>Components</h2>
        <ul class="list-disc pl-8 space-y-0.5">
          <li>
            <a
              href="/components/accordion"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Accordion</a
            >
          </li>
          <li>
            <a
              href="/components/breadcrumb"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Breadcrumb</a
            >
          </li>
          <li>
            <a
              href="/components/card"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Card</a
            >
          </li>
          <li>
            <a
              href="/components/checkbox"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Checkbox</a
            >
          </li>
          <li>
            <a
              href="/components/menubar"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Menubar</a
            >
          </li>
          <li>
            <a
              href="/components/modal"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Modal</a
            >
          </li>
          <li>
            <a
              href="/components/radio-group"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Radio Group</a
            >
          </li>
          <li>
            <a
              href="/components/switch"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Switch</a
            >
          </li>
          <li>
            <a
              href="/components/tabs"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Tabs</a
            >
          </li>
          <li>
            <a
              href="/components/toggle-group"
              class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
              >Toggle Group</a
            >
          </li>
        </ul>
      </div>
    </div>`;
  },
};
