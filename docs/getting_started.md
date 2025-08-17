# Getting Started with Webs

This guide will walk you through creating your first Webs application.

---

## Prerequisites

Before you begin, make sure you have [Bun](https://bun.sh/) installed on your system. Webs uses the Bun runtime and toolkit for its development server, package management, and bundling.

---

## Creating a New Project

The easiest way to start a new Webs project is by using the official scaffolding tool, `create-webs-app`.

Open your terminal and run the following command:

```bash
bunx create-webs-app my-first-project
```

This command will create a new directory called `my-first-project` and populate it with a starter template.

---

## Running the Development Server

Once the project is created, navigate into the new directory and start the development server.

```bash
# Navigate into your project directory
cd my-first-project

# Install the single dependency (the webs framework itself)
bun install

# Start the development server
bun run dev
```

The CLI will start the server and watch your files for changes. Your new site is now running at `http://localhost:3000`!

The development server includes:

- **Asset Bundling**: Compiles your code and styles for the browser.
- **Hot Module Replacement (HMR)**: Automatically reloads the browser when you make changes to your code, without losing component state.
- **Server-Side Rendering**: Renders your components on the server for fast initial page loads.

---

## Project Structure

Let's take a look at the structure of a new Webs project:

```
my-first-project/
├── .tmp/             # Temporary build files (auto-generated)
├── dist/             # Production build output (auto-generated)
├── node_modules/     # Project dependencies
├── src/
│   ├── app/
│   │   └── index.js  # The component for the home page ('/')
│   ├── use/          # A place for reusable logic (like stores)
│   └── sql.js        # Database schema and migrations
├── .gitignore
├── bun.lockb
├── package.json
└── README.md
```

### The `src` Directory

This is where your application's source code lives.

- **`src/app/`**: This is the most important directory. It contains your application's **routes**. Each `.js` file in this directory corresponds to a page. For example, `index.js` maps to `/`, `about.js` maps to `/about`, and so on.

- **`src/use/`**: This directory is a convention for storing reusable logic, such as global state stores created with `create_store`.

- **`src/sql.js`**: This is your database configuration file. Here, you define your database schema and create migrations to manage changes over time.

Now you're ready to start building your application! Try opening `src/app/index.js` and making a change to the template—you'll see the browser update instantly.
