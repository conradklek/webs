import * as Breadcrumb from '../../gui/breadcrumb';
import { ComponentWrapper } from '../../gui/utils';

export default {
  name: 'DemoBreadcrumb',
  components: {
    ...Breadcrumb,
    ComponentWrapper,
  },
  template(html) {
    return html`
      <ComponentWrapper componentName="Breadcrumb" class="w-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/components">Components</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbActive>Breadcrumb</BreadcrumbActive>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ComponentWrapper>
    `;
  },
};
