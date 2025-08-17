# Styling in Webs with Tailwind CSS

Webs is built from the ground up with a deep, native integration of the **Tailwind CSS v4 engine**. This modern approach allows you to write powerful, scoped, and reusable styles directly inside your component files, blending the power of a utility-first framework with the organization of component-based CSS.

You get the best of both worlds: the ability to define reusable classes and design systems, plus the flexibility to apply one-off styles directly in your markup without ever leaving your HTML.

---

## The `styles` Property

The foundation of styling in Webs is the `styles` property within a component definition. All CSS written here is **automatically scoped** to that component, preventing class name collisions and ensuring your styles don't leak out and affect other parts of your application.

```javascript
export default {
  name: "MyComponent",
  styles: `
    /* All your component's styles, powered by Tailwind, go here. */
  `,
  template: `
    <!-- Your component's HTML -->
  `,
};
```

---

## Core Tailwind v4 Concepts in Webs

The `styles` block is more than just a standard `<style>` tag; it's an entry point to the full Tailwind v4 engine.

### Defining Your Design System with `@theme`

The `@theme` directive is where you define your project's design tokens as CSS custom properties. This is perfect for customizing your color palette, typography scale, or spacing units.

**Example: A styled button**

```javascript
// src/app/components/custom-button.js
export default {
  name: "CustomButton",
  styles: `
    @theme {
      --color-brand: oklch(0.84 0.18 117.33); /* A lovely avocado green */
      --radius-default: 0.5rem;
    }

    .btn-brand {
      @apply bg-brand text-white font-bold py-2 px-4;
      border-radius: var(--radius-default);
    }
  `,
  template: `
    <button type="button" class="btn-brand">Click Me</button>
  `,
};
```

_Notice how `bg-brand` in the `@apply` directive automatically uses the `--color-brand` variable we defined._

### Structuring CSS with `@layer`

The `@layer` directive helps organize your CSS and control its precedence. Webs encourages using `base` for element-level defaults and `components` for reusable classes.

```javascript
// src/app/components/alert.js
export default {
  name: "Alert",
  styles: `
    @layer components {
      .alert {
        @apply p-4 rounded-md;
      }
      .alert-warning {
        @apply bg-yellow-100 text-yellow-800;
      }
    }
  `,
  template: `
    <div class="alert alert-warning">
      <p>This is a warning message!</p>
    </div>
  `,
};
```

---

## Utility-First in Your Templates

While defining component classes is powerful, you are never forced to leave your HTML. You can—and should—still use standard Tailwind utility classes directly in your templates for maximum speed and efficiency.

```html
<div class="flex items-center justify-between p-6 bg-slate-100 rounded-lg">
  <p class="text-lg font-semibold">Hello, Webs!</p>
  <button class="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded">
    Get Started
  </button>
</div>
```

---

## Escaping the System: Arbitrary Values & Properties

For those moments when you need a very specific, one-off style that isn't part of your design system, Tailwind's arbitrary value support is built right in. This is like inline styles, but with the superpower of being able to use modifiers like `hover:` and `lg:`.

### Arbitrary Values

Use square bracket notation `[...]` to generate a utility class on the fly.

```html
<!-- Perfect for a specific, non-standard text size or color -->
<p class="text-[13px] text-[#d65a2f]">This text has a very specific style.</p>

<!-- Great for positioning background images -->
<div class="top-[117px] lg:top-[344px]">
  <!-- Content -->
</div>
```

### Arbitrary Properties

If you need a CSS property that Tailwind doesn't have a utility for, you can write completely arbitrary CSS, also using square brackets.

```html
<!-- Useful for applying less-common CSS properties -->
<div class="[mask-type:luminance] hover:[mask-type:alpha]">
  <!-- Content -->
</div>

<!-- Great for setting CSS variables that change on different breakpoints -->
<div class="[--scroll-offset:56px] lg:[--scroll-offset:44px]">
  <!-- Content -->
</div>
```
