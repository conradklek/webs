import * as Breadcrumb from '../../gui/breadcrumb';

const DemoBreadcrumb = {
  name: 'DemoBreadcrumb',
  components: {
    ...Breadcrumb,
  },
  template(html) {
    return html`
      <div class="w-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/components"> Components </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbActive>Breadcrumb</BreadcrumbActive>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    `;
  },
};

export default {
  name: 'BreadcrumbPage',
  components: {
    DemoBreadcrumb,
  },
  template(html) {
    return html`<div
      class="w-full p-8 flex flex-col items-start justify-start gap-6"
    >
      <div class="w-full flex flex-row items-center justify-between gap-4">
        <a href="/components" class="font-medium">webs.site/components</a>
      </div>
      <div class="flex-1 flex flex-col items-start justify-start gap-4">
        <DemoBreadcrumb />
      </div>
    </div>`;
  },
};
