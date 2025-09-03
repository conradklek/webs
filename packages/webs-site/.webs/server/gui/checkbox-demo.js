// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/checkbox.webs
import { state } from "@conradklek/webs";
var checkbox_default = {
  template: ``,
  style: ``,
  name: "checkbox",
  props: {
    defaultChecked: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const isChecked = state(props.defaultChecked);
    function toggle() {
      isChecked.value = !isChecked.value;
    }
    return {
      isChecked,
      toggle
    };
  },
  template(html) {
    return html`
        <button
          type="button"
          role="checkbox"
          :aria-checked="isChecked"
          @click="toggle"
          :data-state="isChecked ? 'checked' : 'unchecked'"
          class="peer h-4 w-4 shrink-0 rounded-sm border border-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-muted data-[state=checked]:bg-blue-600 data-[state=checked]:border-transparent"
        ></button>
      `;
  }
};

// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/checkbox-demo.webs
var checkbox_demo_default = {
  template: `
  <div class="flex items-center space-x-2">
    <checkbox id="terms" />
    <label
      for="terms"
      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      Accept terms and conditions
    </label>
  </div>
`,
  style: ``,
  name: "checkbox-demo",
  components: {
    checkbox: checkbox_default
  }
};
export {
  checkbox_demo_default as default
};
