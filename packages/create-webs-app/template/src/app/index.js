export default {
  name: "Home",
  state() {
    return {
      count: 0,
    }
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  template: `
    <div class="p-8 flex flex-col items-start justify-start gap-2 min-h-screen">
      <h1 class="font-medium">@conradklek/webs</h1>
      <button type="button" @click="increment" class="cursor-pointer active:opacity-50">This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!</button>
      <p>Edit <code class="text-sm">src/app/index.js</code> to get started.</p>
    </div>
  `,
};

