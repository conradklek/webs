const CardContent = {
  name: "CardContent",
  styles: `
    @layer components {
      .card-content {
        @apply p-6 pt-0;
      }
    }
  `,
  template: `
    <div class="card-content">
      <slot></slot>
    </div>
  `,
};

const CardDescription = {
  name: "CardDescription",
  styles: `
    @layer components {
      .card-description {
        @apply text-sm text-muted-foreground;
      }
    }
  `,
  template: `
    <p class="card-description">
      <slot></slot>
    </p>
  `,
};

const CardFooter = {
  name: "CardFooter",
  styles: `
    @layer components {
      .card-footer {
        @apply flex items-center p-6 pt-0;
      }
    }
  `,
  template: `
    <div class="card-footer">
      <slot></slot>
    </div>
  `,
};

const CardHeader = {
  name: "CardHeader",
  styles: `
    @layer components {
      .card-header {
        @apply flex flex-col space-y-1.5 p-6;
      }
    }
  `,
  template: `
    <div class="card-header">
      <slot></slot>
    </div>
  `,
};

const CardTitle = {
  name: "CardTitle",
  styles: `
    @layer components {
      .card-title {
        @apply text-lg font-medium leading-none;
      }
    }
  `,
  template: `
    <h3 class="card-title">
      <slot></slot>
    </h3>
  `,
};

const Card = {
  name: "Card",
  styles: `
    @layer components {
      .card {
        @apply rounded-lg border border-border bg-card text-card-foreground;
      }
    }
  `,
  template: `
    <div class="card">
      <slot></slot>
    </div>
  `,
};

Card.components = {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};

export default Card;
