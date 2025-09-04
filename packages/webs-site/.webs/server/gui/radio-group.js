// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/radio-group.webs
import { provide, inject, state } from "@conradklek/webs";
var RadioGroupItem = {
  name: "radio-group-item",
  props: {
    value: { type: String, required: true }
  },
  setup(props) {
    const radioGroup = inject("radioGroup");
    return { radioGroup, value: props.value };
  },
  template(html) {
    return html`
        <button
          type="button"
          role="radio"
          :aria-checked="radioGroup.is_selected(value)"
          :data-state="radioGroup.is_selected(value) ? 'checked' : 'unchecked'"
          @click="radioGroup.select(value)"
          class="aspect-square h-4 w-4 rounded-full border border-border text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div
            w-if="radioGroup.is_selected(value)"
            class="flex items-center justify-center"
          >
            <div class="h-2.5 w-2.5 rounded-full bg-current fill-current"></div>
          </div>
        </button>
      `;
  }
};
var radio_group_default = {
  name: "radio-group",
  components: { "radio-group-item": RadioGroupItem },
  props: {
    defaultValue: { type: String }
  },
  setup(props) {
    const selectedValue = state(props.defaultValue);
    function select(value) {
      selectedValue.value = value;
    }
    function is_selected(value) {
      return selectedValue.value === value;
    }
    provide("radioGroup", { select, is_selected });
  },
  template(html) {
    return html`
        <div role="radiogroup" class="flex flex-col gap-2">
          <slot></slot>
        </div>
      `;
  }
};
export {
  radio_group_default as default,
  RadioGroupItem
};
