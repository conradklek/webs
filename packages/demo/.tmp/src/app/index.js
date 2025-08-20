import { use_session } from "../use/session.js";
import { use_logger } from "../use/logger.js";
import Card from "../gui/card/index.js";
import Accordion from "../gui/accordion/index.js";
import Breadcrumb from "../gui/breadcrumb/index.js";

export const middleware = [use_logger];

export default {
  name: "Home",
  state() {
    return {
      count: 0,
      username: "",
      email: "",
    };
  },
  setup() {
    return {
      session: use_session,
    };
  },
  methods: {
    increment() {
      this.count++;
    },
    handleInput(event) {
      const { name, value } = event.target;
      this[name] = value;
      console.log(`${name} updated to: ${value}`);
    },
  },
  styles: `
    @theme {
      --color-primary: #1e40af;
    }
    @layer base {
      a { @apply underline cursor-pointer active:opacity-50 whitespace-nowrap; }
    }
    @layer components {
      .btn {
        @apply shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded text-sm tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer;
      }

      .btn-default {
        @apply bg-primary text-primary-foreground hover:bg-primary/90;
      }
      .btn-destructive {
        @apply bg-destructive text-white hover:bg-destructive/90;
      }
      .btn-outline {
        @apply border border-input bg-background hover:bg-accent hover:text-accent-foreground;
      }
      .btn-secondary {
        @apply bg-secondary text-secondary-foreground hover:bg-secondary/80;
      }
      .btn-ghost {
        @apply hover:bg-accent hover:text-accent-foreground;
      }
      .btn-link {
        @apply text-primary underline-offset-4 hover:underline;
      }

      .btn-size-default {
        @apply h-7 px-2;
      }
      .btn-size-sm {
        @apply h-6 rounded-md px-1.5;
      }
      .btn-size-lg {
        @apply h-8 px-2;
      }
      .btn-size-icon {
        @apply w-7 h-7;
      }

      .input {
        @apply flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm;
      }

      .textarea {
        @apply flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm;
      }
    }
  `,
  template: `
    <div class="w-full p-8 flex flex-col items-start justify-start gap-8">
      <div class="w-full flex flex-row items-center justify-start gap-4">
        <h1>webs</h1>
        <div class="w-full flex flex-row items-center justify-end gap-4">
          <div w-if="!session.user.username" class="flex flex-row items-center justify-start gap-4">
            <a href="/login">Login</a>
            <span>|</span>
            <a href="/signup">Signup</a>
          </div>
          <div w-else class="flex flex-row items-center justify-start gap-4">
            <button type="button" @click="session.logout()" class="btn btn-default btn-size-default">Logout</button>
            <span>|</span>
            <a href="/profile">Profile &rarr;</a>
          </div>
        </div>
      </div>
      <div w-if="session.user.username" class="flex-1 flex flex-col items-start justify-start gap-2">
        <p>Welcome back, @{{ session.user.username }}!</p>
      </div>
      <div w-else class="flex-1 flex flex-col items-start justify-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription>Deploy your new project in one-click.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This is the main content area of the card. You can place any HTML here.</p>
            <div class="flex flex-col gap-4 mt-4">
              <label>
                Username:
                <input
                  type="text"
                  name="username"
                  :value="username"
                  @input="handleInput"
                  class="input mt-1"
                />
              </label>
              <label>
                Email:
                <input
                  type="email"
                  name="email"
                  :value="email"
                  @input="handleInput"
                  class="input mt-1"
                />
              </label>
              <label>
                Message:
                <textarea
                  name="message"
                  class="textarea mt-1"
                ></textarea>
              </label>
            </div>
          </CardContent>
          <CardFooter>
            <button type="button" @click="increment" class="btn btn-default btn-size-default">
              This button has been clicked {{ count }} time{{ count === 1 ? '' : 's' }}!
            </button>
          </CardFooter>
        </Card>
        <Accordion type="multiple">
          <AccordionItem value="item1">
            <AccordionTrigger>Is it accessible?</AccordionTrigger>
            <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item2">
            <AccordionTrigger>Is it styled?</AccordionTrigger>
            <AccordionContent>Yes. It comes with default styles that matches the other components' aesthetic.</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator></BreadcrumbSeparator>
            <BreadcrumbEllipsis></BreadcrumbEllipsis>
            <BreadcrumbSeparator></BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  `,
  components: {
    Accordion,
    Breadcrumb,
    Card,
  },
};
