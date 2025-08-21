const Switch = {
  name: "Switch",
  props: {
    id: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: "",
    },
    size: {
      type: String,
      default: "default",
    },
    defaultPressed: {
      type: Boolean,
      default: false,
    },
  },
  state({ props, reactive }) {
    const state = reactive({
      is_on: props.defaultPressed,
    });

    const toggle = () => {
      state.is_on = !state.is_on;
    };

    const getTrackClasses = () => {
      const base =
        "group inline-flex flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2";

      const sizes = {
        sm: "h-5 w-9",
        default: "h-6 w-11",
        lg: "h-7 w-12",
      };

      const stateColor = state.is_on ? "bg-blue-600" : "bg-gray-200";

      return `${base} ${sizes[props.size] || sizes.default} ${stateColor}`;
    };

    const getThumbClasses = () => {
      const base =
        "pointer-events-none inline-block transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out";

      const sizes = {
        sm: "h-4 w-4",
        default: "h-5 w-5",
        lg: "h-6 w-6",
      };

      const translation = {
        sm: state.is_on ? "translate-x-4" : "translate-x-0",
        default: state.is_on ? "translate-x-5" : "translate-x-0",
        lg: state.is_on ? "translate-x-5" : "translate-x-0",
      };

      return `${base} ${sizes[props.size] || sizes.default} ${translation[props.size] || translation.default
        }`;
    };

    return {
      state,
      toggle,
      getTrackClasses,
      getThumbClasses,
    };
  },
  template(html) {
    return html`
      <div class="flex flex-row items-center">
        <button
          type="button"
          @click="toggle"
          :class="getTrackClasses()"
          :aria-pressed="state.is_on"
          role="switch"
        >
          <span :class="getThumbClasses()"></span>
        </button>
        <label
          w-if="label"
          :for="id"
          @click="toggle"
          class="ml-3 text-sm font-medium text-primary cursor-pointer"
        >
          {{ label }}
        </label>
      </div>
    `;
  },
};

export default Switch;
