export const CardContent = {
  name: 'CardContent',
  template(html) {
    return html`
      <div class="p-6 pt-0">
        <slot></slot>
      </div>
    `;
  },
};

export const CardDescription = {
  name: 'CardDescription',
  template(html) {
    return html`
      <p class="text-sm text-muted-foreground">
        <slot></slot>
      </p>
    `;
  },
};

export const CardFooter = {
  name: 'CardFooter',
  template(html) {
    return html`
      <div class="flex items-center p-6 pt-0">
        <slot></slot>
      </div>
    `;
  },
};

export const CardHeader = {
  name: 'CardHeader',
  template(html) {
    return html`
      <div class="flex flex-col space-y-1.5 p-6">
        <slot></slot>
      </div>
    `;
  },
};

export const CardTitle = {
  name: 'CardTitle',
  template(html) {
    return html`
      <h3 class="text-lg font-medium leading-none">
        <slot></slot>
      </h3>
    `;
  },
};

export const Card = {
  name: 'Card',
  components: {
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
  },
  template(html) {
    return html`
      <div class="rounded-lg border border-border bg-card text-card-foreground">
        <slot></slot>
      </div>
    `;
  },
};
