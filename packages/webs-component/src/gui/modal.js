const Modal = {
  name: "Modal",
  state({ provide, reactive }) {
    const state = reactive({
      isOpen: false,
    });

    const open = () => (state.isOpen = true);
    const close = () => (state.isOpen = false);
    const is_open = () => state.isOpen;

    provide("modal", { open, close, is_open });
  },
  template(html) {
    return html`<slot></slot>`;
  },
};

const ModalTrigger = {
  name: "ModalTrigger",
  state({ inject }) {
    return { modal: inject("modal") };
  },
  template(html) {
    return html`<button type="button" @click="modal.open()">
      <slot></slot>
    </button>`;
  },
};

const ModalClose = {
  name: "ModalClose",
  state({ inject }) {
    return { modal: inject("modal") };
  },
  template(html) {
    return html`<button @click="modal.close()">
      <slot></slot>
    </button>`;
  },
};

const ModalContent = {
  name: "ModalContent",
  state({ inject }) {
    return { modal: inject("modal") };
  },
  template(html) {
    return html`
      <div w-if="modal.is_open()">
        <div
          class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-md rounded-lg"
        >
          <slot></slot>
        </div>
      </div>
    `;
  },
};

const ModalHeader = {
  name: "ModalHeader",
  template(html) {
    return html`<div class="flex flex-col space-y-1.5 text-left">
      <slot></slot>
    </div>`;
  },
};

const ModalFooter = {
  name: "ModalFooter",
  template(html) {
    return html`<div
      class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
    >
      <slot></slot>
    </div>`;
  },
};

const ModalTitle = {
  name: "ModalTitle",
  template(html) {
    return html`<h2 class="text-lg font-medium leading-none">
      <slot></slot>
    </h2>`;
  },
};

const ModalDescription = {
  name: "ModalDescription",
  template(html) {
    return html`<p class="text-muted-foreground text-pretty"><slot></slot></p>`;
  },
};

Modal.components = {
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  ModalClose,
};

export default Modal;
