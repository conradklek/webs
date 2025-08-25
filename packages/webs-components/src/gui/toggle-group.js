import { provide, inject, useState } from '@conradklek/webs';

const ToggleGroupItem = {
  name: 'ToggleGroupItem',
  props: {
    value: { type: String, required: true },
  },
  setup(props) {
    const group = inject('toggleGroup');
    return { group, value: props.value };
  },
  template(html) {
    return html`
      <button
        type="button"
        @click="group.toggle(value)"
        :data-state="group.is_on(value) ? 'on' : 'off'"
        class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground h-10 px-3"
      >
        <slot></slot>
      </button>
    `;
  },
};

const ToggleGroup = {
  name: 'ToggleGroup',
  components: { ToggleGroupItem },
  props: {
    type: { type: String, default: 'single' },
    defaultValue: { type: [String, Array], default: null },
  },
  setup(props) {
    const value = useState(
      props.type === 'multiple'
        ? new Set(props.defaultValue || [])
        : props.defaultValue,
    );

    function toggle(itemValue) {
      if (props.type === 'multiple') {
        const newValue = new Set(value.value);
        if (newValue.has(itemValue)) {
          newValue.delete(itemValue);
        } else {
          newValue.add(itemValue);
        }
        value.value = newValue;
      } else {
        value.value = value.value === itemValue ? null : itemValue;
      }
    }

    function is_on(itemValue) {
      return props.type === 'multiple'
        ? value.value.has(itemValue)
        : value.value === itemValue;
    }

    provide('toggleGroup', { toggle, is_on });
  },
  template(html) {
    return html`<div class="flex items-center justify-center gap-1">
      <slot></slot>
    </div>`;
  },
};

export default ToggleGroup;
