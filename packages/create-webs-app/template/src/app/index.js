export default {
  name: "Home",
  state: () => ({
    message: "Welcome to webs.js"
  }),
  template: `
    <div class="p-8 flex flex-col items-start justify-start gap-2 min-h-screen">
      <h1 class="font-medium">@conradklek/webs</h1>
      <p>{{ message }}</p>
      <p>Edit <code class="text-sm">src/app/index.js</code> to get started.</p>
    </div>
  `,
};

