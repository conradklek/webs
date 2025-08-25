import { provide, inject, useState } from '@conradklek/webs';

export const ModalTrigger = {
  name: 'ModalTrigger',
  setup() {
    const modal = inject('modal');
    return { modal };
  },
  template(html) {
    return html`<button type="button" @click="modal.open()">
      <slot></slot>
    </button>`;
  },
};

export const ModalClose = {
  name: 'ModalClose',
  setup() {
    const modal = inject('modal');
    return { modal };
  },
  template(html) {
    return html`<button @click="modal.close()"><slot></slot></button>`;
  },
};

export const ModalContent = {
  name: 'ModalContent',
  setup() {
    const modal = inject('modal');
    return { modal };
  },
  template(html) {
    return html`
      <div w-if="modal && modal.is_open()">
        <div
          class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-md rounded-lg"
        >
          <slot></slot>
        </div>
      </div>
    `;
  },
};

export const ModalHeader = {
  name: 'ModalHeader',
  template(html) {
    return html`<div class="flex flex-col space-y-1.5 text-left">
      <slot></slot>
    </div>`;
  },
};

export const ModalFooter = {
  name: 'ModalFooter',
  template(html) {
    return html`<div
      class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
    >
      <slot></slot>
    </div>`;
  },
};

export const ModalTitle = {
  name: 'ModalTitle',
  template(html) {
    return html`<h2 class="text-lg font-medium leading-none">
      <slot></slot>
    </h2>`;
  },
};

export const ModalDescription = {
  name: 'ModalDescription',
  template(html) {
    return html`<p class="text-muted-foreground text-pretty"><slot></slot></p>`;
  },
};

export const Modal = {
  name: 'Modal',
  components: {
    ModalTrigger,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalTitle,
    ModalDescription,
    ModalClose,
  },
  setup() {
    const isOpen = useState(false);

    function open() {
      isOpen.value = true;
    }
    function close() {
      isOpen.value = false;
    }
    function is_open() {
      return isOpen.value;
    }

    provide('modal', { open, close, is_open });
  },
  template(html) {
    return html`<slot></slot>`;
  },
};
