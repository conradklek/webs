import { ComponentWrapper } from '../../gui/utils';
import * as Modal from '../../gui/modal';

export default {
  name: 'DemoModal',
  components: {
    ...Modal,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper class="w-full">
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
      </ComponentWrapper>
    `;
  },
};
