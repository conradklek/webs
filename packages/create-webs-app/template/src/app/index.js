export default {
  name: "Home",
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
  template: `
    <div class="p-8 flex flex-col items-start justify-start gap-2 min-h-screen">
      <h1 class="font-medium">webs.js</h1>
      <button type="button" @click="increment" class="cursor-pointer active:opacity-50">
        Clicked {{ count }} time{{ count === 1 ? '' : 's' }}!
      </button>
    </div>
  `,
};
