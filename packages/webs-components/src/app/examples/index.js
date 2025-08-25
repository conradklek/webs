export default {
  name: 'ExamplesIndex',
  template(html) {
    return html`
      <div class="w-full p-8 flex flex-col items-start justify-start gap-6">
        <div class="w-full flex flex-row items-center justify-between gap-4">
          <a href="/" class="font-medium">webs.site</a>
          <div class="w-full flex flex-row items-center justify-end gap-4">
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
        </div>
        <div class="flex-1 flex flex-col items-start justify-start gap-4">
          <h1>Examples</h1>
          <ul class="list-disc pl-8 space-y-0.5">
            <li>
              <a
                href="/examples/todos"
                class="ml-1 -my-1 py-1 text-blue-600 underline hover:opacity-75 active:opacity-50"
                >Todos</a
              >
            </li>
          </ul>
        </div>
      </div>
    `;
  },
};
