// @bun
// webs-sfc:/Users/conradklek/webs/packages/webs-site/src/gui/modal.webs
import { provide, inject, state } from "@conradklek/webs";
var ModalTrigger = {
  name: "modal-trigger",
  setup() {
    const modal = inject("modal");
    return { modal };
  },
  template(html) {
    return html`<button type="button" @click="modal.open()">
        <slot></slot>
      </button>`;
  }
};
var ModalClose = {
  name: "modal-close",
  setup() {
    const modal = inject("modal");
    return { modal };
  },
  template(html) {
    return html`<button @click="modal.close()"><slot></slot></button>`;
  }
};
var ModalContent = {
  name: "modal-content",
  setup() {
    const modal = inject("modal");
    return { modal };
  },
  template(html) {
    return html`
        <div w-if="modal && modal.isOpen()">
          <div
            class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-md rounded-lg"
          >
            <slot></slot>
          </div>
        </div>
      `;
  }
};
var ModalHeader = {
  name: "modal-header",
  template(html) {
    return html`<div class="flex flex-col space-y-1.5 text-left">
        <slot></slot>
      </div>`;
  }
};
var ModalFooter = {
  name: "modal-footer",
  template(html) {
    return html`<div
        class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
      >
        <slot></slot>
      </div>`;
  }
};
var ModalTitle = {
  name: "modal-title",
  template(html) {
    return html`<h2 class="text-lg font-medium leading-none">
        <slot></slot>
      </h2>`;
  }
};
var ModalDescription = {
  name: "modal-description",
  template(html) {
    return html`<p class="text-muted-foreground text-pretty">
        <slot></slot>
      </p>`;
  }
};
var modal_default = {
  template: ``,
  style: ``,
  name: "modal",
  components: {
    "modal-trigger": ModalTrigger,
    "modal-content": ModalContent,
    "modal-header": ModalHeader,
    "modal-footer": ModalFooter,
    "modal-title": ModalTitle,
    "modal-description": ModalDescription,
    "modal-close": ModalClose
  },
  setup() {
    const opened = state(false);
    function open() {
      opened.value = true;
    }
    function close() {
      opened.value = false;
    }
    function isOpen() {
      return opened.value;
    }
    provide("modal", { open, close, isOpen });
  },
  template(html) {
    return html`<div><slot></slot></div>`;
  }
};
export {
  modal_default as default,
  ModalTrigger,
  ModalTitle,
  ModalHeader,
  ModalFooter,
  ModalDescription,
  ModalContent,
  ModalClose
};
