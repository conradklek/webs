This document outlines the major milestones required to transition the Webs
framework from a C library with external bindings into a self-contained,
full-stack C application capable of both server-side and client-side
(via WebAssembly) execution.

# ROADMAP & MILESTONES

This roadmap is divided into phases. Each phase builds upon the previous one,
progressively adding features to create a complete, C-native web framework.

---

### MILESTONE 1: FOUNDATIONAL ENHANCEMENTS & A TRUE C-NATIVE SERVER

**Goal:** Remove the dependency on an external runtime for request handling by building a complete, robust HTTP server and routing layer in C.

- [x] **1.1. Create a C-Native HTTP Router:**
- [x] Define a `Router` struct to hold a collection of `RouteDefinition` structs.
- [x] Each `RouteDefinition` should map a path string (e.g., `"/users/:id"`) and an HTTP method to a C function pointer (the "handler").
- [x] Implement a `router_handle_request` function that:
- Takes a parsed HTTP request object.
- Iterates through registered routes.
- Uses `webs_match_route` to find a match and extract URL parameters.
- Invokes the corresponding C handler function.

- [x] **1.2. Implement a Middleware Pattern:**
- [x] Define a `RequestContext` struct to pass state through the request pipeline (e.g., pointers to the DB connection, parsed request, authenticated user).
- [x] Create a middleware function signature, e.g., `void (*MiddlewareFunc)(RequestContext* ctx, void (*next)(RequestContext*))`.
- [x] Implement an authentication middleware in C that populates `ctx->user` before calling the next handler in the chain.

- [x] **1.3. Port Core API Logic to C Handlers:**
- [x] Write C handler functions for core API endpoints (e.g., login, register).
- [x] Register these C functions with the new C router.
- [x] These handlers will use existing modules (e.g., `W->db->...`) to interact with the database and `webs_server_write_response` to send JSON.

- [x] **1.4. Refine Error Handling & Memory Management Conventions:**
- [x] Standardize on the return-code/out-parameter pattern for functions that can fail.
- [x] Add comments to function signatures in header files to clarify memory ownership (e.g., `// Caller must free the returned value.`).

---

### MILESTONE 2: ADVANCED COMPONENT MODEL IN C

**Goal:** Evolve the C component instance to support a complete, modern composition model with state, lifecycle hooks, and dependency injection.

- [x] **2.1. Enhance the `ComponentInstance` Struct:**
- [x] Add new fields to the C `ComponentInstance` struct to manage:
- `Value* slots` (for content passed from a parent).
- `Value* attrs` (for fallthrough attributes).
- `Value* provides` (for dependency injection).
- An array or linked list for lifecycle hook function pointers.

- [x] **2.2. Implement the `setup` Function and Reactive State:**
- [x] Add a function pointer to the `Component` definition struct: `Value* (*setup)(Value* props, Value* context)`.
- [x] When creating a component instance, call this `setup` function.
- [x] Store the returned object `Value` as `instance->internalCtx`.
- [x] Modify `evaluate_expression` to resolve identifiers by checking `internalCtx` first, then `props`, creating the render context.

- [x] **2.3. Implement Lifecycle Hooks:**
- [x] Add functions like `onMounted`, `onUnmounted` that, when called during `setup`, register a C function pointer in the instance's hook list.
- [x] Invoke these registered hooks at the appropriate times in the component's lifecycle (e.g., after patching to the DOM).

- [x] **2.4. Implement Provide/Inject:**
- [x] Implement `provide(key, value)` to add an entry to the current instance's `provides` map.
- [x] Implement `inject(key)` to search for a key, starting at the current instance and walking up the `parent` chain.

---

### MILESTONE 3: COMPILER & CLIENT-SIDE RUNTIME (THE WEBASSEMBLY LEAP)

**Goal:** Compile the C framework to WebAssembly (Wasm) to run on the client, and enhance the bundler into a compiler that outputs a Wasm-compatible format.

- [ ] **3.1. Evolve the Bundler into a Compiler:**
- [ ] Modify the C bundler (`bundler.c`) to not just bundle source text, but to compile `.webs` templates into an efficient "render plan".
- [ ] This render plan could be a serialized AST or a custom bytecode format that the C runtime can execute without a full parse step on the client.

- [ ] **3.2. Compile the C Core to WebAssembly:**
- [ ] Set up a build process (e.g., using Emscripten) to compile the C core (reactivity, VDOM, patching, component logic) into a `.wasm` file.
- [ ] This Wasm module will become the client-side runtime.

- [ ] **3.3. Create the JavaScript "Glue" Bridge:**
- [ ] Wasm cannot directly access the DOM. Create a minimal JS file that:
- Exports functions for C to call (e.g., `js_bridge_create_element`).
- Listens for browser events (e.g., `click`) and calls exported C functions from the Wasm module to handle them.
- [ ] The C code will need to be adapted to call these external JS functions for all DOM manipulations.

- [ ] **3.4. Create the C Client-Side Renderer:**
- [ ] Write the C function (running in Wasm) that interprets the "render plan" from step 3.1.
- [ ] This function will drive the VDOM creation and patching process by calling out to the JS bridge functions for DOM operations.

---

### MILESTONE 4: FULL-STACK INTEGRATION & HYDRATION

**Goal:** Connect the C server and the C-Wasm client to create a seamless, performant user experience with fast initial loads.

- [ ] **4.1. Implement Pure C Server-Side Rendering (SSR):**
- [ ] The C server's page request handler will:
- Create the root component instance using the enhanced C component model.
- Use `webs_ssr_render_vnode` to generate the initial HTML string.
- Serialize the component's initial state (from `setup`) into a JSON string.
- Send a full HTML document containing the rendered HTML and a `<script>` tag with the serialized state.

- [ ] **4.2. Implement Client-Side Hydration in C/Wasm:**
- [ ] The JS glue code will fetch and instantiate the Wasm module.
- [ ] The C `main` function (in Wasm) will:
- Read the state from the global `window.__WEBS_STATE__` object.
- Create the root component instance _in Wasm memory_.
- Generate the initial VDOM tree _in Wasm memory_.
- Walk the VDOM tree and the _existing_ real DOM tree simultaneously, linking VNodes to their real DOM elements and attaching event listeners via the JS bridge. From this point, all updates are handled by the patcher.

---

### MILESTONE 5: ECOSYSTEM & FRAMEWORK FEATURES

**Goal:** Build the high-level features that make a framework powerful and enjoyable to use.

- [ ] **5.1. Build a Client-Side Router in C/Wasm:**
- [ ] Use the JS bridge to interact with the browser's History API (`pushState`).
- [ ] When the URL changes, the C/Wasm router will parse the new path, match it against its routes, and render the appropriate component into a designated root element.

- [ ] **5.2. Create a Global State Management Utility:**
- [ ] Implement a `store` concept similar to the reactivity primitives.
- [ ] This would allow creating a global `reactive` object that any component can access (perhaps via `inject`) for cross-component state.

# --- STARTING POINTS & RELEVANT CODE ---

This section maps the roadmap milestones to existing files in the C codebase
to provide a clear starting point for development.

### Milestone 1: C-Native Server

- **Router Logic:** The core matching primitive already exists in `lib/core/url.c` with `url_match_route`. The new router will be a higher-level abstraction built around this function.
- **Request Handling:** The current request loop is in `lib/modules/server.c`. The `server_listen_method` is where the new C router's `router_handle_request` function would be called after the request is parsed by `webs_http_parse_request` (from `lib/modules/http.c`).
- **API Handlers:** Your handlers will make extensive use of the database functions defined in `lib/modules/db.h` and implemented in `lib/modules/db.c`.
- **Error Handling:** See the `try/catch` implementation in `bin/cli.c` for an example of what to refactor. Standardize on returning a `Status` enum (`lib/core/error.h`) from functions that can fail.

### Milestone 2: Component Model

- **ComponentInstance:** The struct to expand is in `lib/framework/component.h`.
- **`setup` Function:** The `component()` function in `lib/framework/component.c` is where the `setup` function pointer on the component definition would be called. The `evaluate_expression` function in `lib/framework/evaluate.c` would need to be modified to search the new `internalCtx` for state.
- **Lifecycle Hooks:** The existing `onMount` and `onBeforeUnmount` logic can be seen in `webs_mount_component` and `webs_unmount_component` in `lib/webs.c`. This provides a pattern to follow for adding more hooks.

### Milestone 3: Compiler & WebAssembly

- **Compiler:** The current bundler logic in `lib/framework/bundler.c` is the starting point. Its responsibility will expand from simply concatenating asset content to parsing templates (`lib/framework/template.c`) and expressions (`lib/framework/expression.c`) into a serialized "render plan".
- **Wasm Build Target:** The `Makefile` is where you would add a new build target to compile the framework's C source files into a `.wasm` module, likely using a tool like Emscripten.
- **Client-Side Renderer:** This new C module (to be compiled to Wasm) will leverage the existing VDOM creation in `lib/framework/vdom.c` (`h` function) and the diffing/patching logic in `lib/framework/patch.c`. The key change will be that the "patches" will trigger calls to external JS functions (the "glue bridge") instead of being serialized.

### Milestone 4: Integration & Hydration

- **SSR:** The core function `webs_ssr_render_vnode` in `lib/framework/ssr.c` already exists. This task involves integrating it with the richer component instances from Milestone 2 to properly render state returned from `setup`.
- **Hydration:** This is a new client-side process. It will be a C function (in Wasm) that uses the existing VDOM (`vdom.c`) and component (`component.c`) logic to build an in-memory representation of the page that matches the server-rendered HTML.

### Milestone 5: Ecosystem

- **Client-Side Router:** Will re-use the `url_match_route` function from `lib/core/url.c` on the client (in Wasm) to determine which component to render.
- **Global State:** Will be built using the existing reactivity primitives defined in `lib/framework/reactivity.h` and implemented in `lib/framework/reactivity.c` (e.g., `ref`, `reactive`, `effect`).
