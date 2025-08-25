import * as Modal from '../../gui/modal';

const DemoModal = {
  name: 'DemoModal',
  components: {
    ...Modal,
  },
  template(html) {
    return html`
      <div class="w-full">
        <Modal>
          <ModalTrigger> Open Modal </ModalTrigger>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Create project</ModalTitle>
              <ModalDescription>
                Deploy your new project in one-click.
              </ModalDescription>
            </ModalHeader>
            <div class="py-4">
              <p>
                This is the main content of the modal. You can add any content
                here, like forms or additional information.
              </p>
            </div>
            <ModalFooter>
              <ModalClose class="btn btn-default btn-size-lg w-full"
                >Close</ModalClose
              >
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    `;
  },
};

export default {
  name: 'ModalPage',
  components: {
    DemoModal,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoModal />
      </div>
    </div>`;
  },
};
