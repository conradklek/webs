import { test, expect, describe, beforeEach } from 'bun:test';
import { compile, compileCache } from './compiler.js';
import * as VDOM from '../core/vdom.js';

describe('Compiler', () => {
  beforeEach(() => {
    compileCache.clear();
  });

  const compileTestComponent = (template, options = {}) => {
    return compile({ name: `Test-${Date.now()}`, template, ...options });
  };

  test('should compile simple text', () => {
    const renderFn = compileTestComponent('Hello World');
    const vnode = renderFn({});
    expect(vnode.type).toBe(VDOM.Text);
    expect(vnode.children).toBe('Hello World');
  });

  test('should compile an element', () => {
    const renderFn = compileTestComponent('<div></div>');
    const vnode = renderFn({});
    expect(vnode.type).toBe('div');
    expect(vnode.children).toBe(null);
  });

  test('should compile an element with children', () => {
    const renderFn = compileTestComponent('<div><p>Hello</p></div>');
    const vnode = renderFn({});
    expect(Array.isArray(vnode.children)).toBe(true);
    const pVnode = vnode.children[0];
    expect(pVnode.type).toBe('p');
    expect(Array.isArray(pVnode.children)).toBe(true);
    const textVnode = pVnode.children[0];
    expect(textVnode.type).toBe(VDOM.Text);
    expect(textVnode.children).toBe('Hello');
  });

  test('should compile interpolations', () => {
    const template = '<div>{{ message }}</div>';
    const renderFn = compileTestComponent(template);
    const vnode = renderFn({ message: 'Hello from state' });

    const dynamicTextVnode = vnode.children[0];
    expect(dynamicTextVnode.type).toBe(VDOM.DynamicText);

    const textVnode = dynamicTextVnode.children[0];
    expect(textVnode.type).toBe(VDOM.Text);
    expect(textVnode.children).toBe('Hello from state');
    expect(textVnode.props['w-dynamic']).toBe(true);
  });

  test('should compile static and dynamic attributes', () => {
    const template = '<div id="main" :class="myClass"></div>';
    const renderFn = compileTestComponent(template);
    const vnode = renderFn({ myClass: 'container' });

    expect(vnode.props).toEqual({
      id: 'main',
      class: 'container',
    });
  });

  test('should compile event handlers', () => {
    const template = '<button @click="handleClick"></button>';
    const renderFn = compileTestComponent(template);
    const handleClick = () => {};
    const vnode = renderFn({ handleClick });

    expect(vnode.props.onClick).toBeInstanceOf(Function);
  });

  test('should compile an if directive', () => {
    const template = '{#if show}<div>Visible</div>{/if}';
    const renderFn = compileTestComponent(template);

    const vnodeWhenTrue = renderFn({ show: true });
    expect(vnodeWhenTrue.type).toBe('div');
    const textVnode = vnodeWhenTrue.children[0];
    expect(textVnode.type).toBe(VDOM.Text);
    expect(textVnode.children).toBe('Visible');

    const vnodeWhenFalse = renderFn({ show: false });
    expect(vnodeWhenFalse).toBe(null);
  });

  test('should compile an if-else directive', () => {
    const template =
      '{#if show}<div>Visible</div>{:else}<span>Hidden</span>{/if}';
    const renderFn = compileTestComponent(template);

    const vnodeWhenTrue = renderFn({ show: true });
    expect(vnodeWhenTrue.type).toBe('div');

    const vnodeWhenFalse = renderFn({ show: false });
    expect(vnodeWhenFalse.type).toBe('span');
  });

  test('should compile an each directive', () => {
    const template =
      '<ul>{#each items as item(item.id)}<li>{{ item.name }}</li>{/each}</ul>';
    const renderFn = compileTestComponent(template);
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ];
    const vnode = renderFn({ items });

    expect(vnode.children[0].type).toBe(VDOM.Fragment);

    const listItems = vnode.children[0].children;
    expect(listItems.length).toBe(2);
    expect(listItems[0].type).toBe('li');
    expect(listItems[0].props.key).toBe(1);

    expect(listItems[0].children[0].children[0].children).toBe('A');
    expect(listItems[1].children[0].children[0].children).toBe('B');
    expect(listItems[1].props.key).toBe(2);
  });

  test('should compile a simple component', () => {
    const ChildComponent = {
      name: 'Child',
      template: '<p>I am a child</p>',
    };
    const template = '<div><Child /></div>';
    const renderFn = compileTestComponent(template, {
      components: { Child: ChildComponent },
    });
    const vnode = renderFn({ Child: ChildComponent });
    const childVnode = vnode.children[0];
    expect(childVnode.type).toEqual(ChildComponent);
  });

  test('should compile event handlers with modifiers', () => {
    const template = '<a href="#" @click.prevent="doSomething"></a>';
    const renderFn = compileTestComponent(template);
    const doSomething = () => {};
    const vnode = renderFn({ doSomething });
    expect(vnode.props.onClick).toBeInstanceOf(Function);
  });

  test('should compile two-way data binding with bind:', () => {
    const template =
      '<input :value="text" @input="text = $event.target.value" />';
    const renderFn = compileTestComponent(template);
    const vnode = renderFn({ text: 'hello' });
    expect(vnode.props.value).toBe('hello');
    expect(vnode.props.onInput).toBeInstanceOf(Function);
  });

  test('should compile a dynamic component with :is', () => {
    const CompA = { name: 'CompA', template: '<div>Component A</div>' };
    const CompB = { name: 'CompB', template: '<span>Component B</span>' };
    const template = '<component :is="componentName"></component>';
    const renderFn = compileTestComponent(template, {
      components: { CompA, CompB },
    });

    const vnodeA = renderFn({ componentName: 'CompA', CompA, CompB });
    expect(vnodeA.type).toBe(CompA);

    const vnodeB = renderFn({ componentName: 'CompB', CompA, CompB });
    expect(vnodeB.type).toBe(CompB);
  });

  test('should compile named slots and fallbacks', () => {
    const SlottedComponent = {
      name: 'Slotted',
      template:
        '<div><slot name="header">Default Header</slot><slot>Default Content</slot></div>',
    };
    const template = `<Slotted><template #header><h1>My Header</h1></template><p>My Content</p></Slotted>`;
    const renderFn = compileTestComponent(template, {
      components: { Slotted: SlottedComponent },
    });
    const vnode = renderFn({ Slotted: SlottedComponent });
    expect(vnode.type).toBe(SlottedComponent);
    expect(vnode.children.header).toBeInstanceOf(Function);
    expect(vnode.children.default).toBeInstanceOf(Function);
  });

  test('should handle multiple root nodes by wrapping in a fragment', () => {
    const template = '<h1>Title</h1><p>Paragraph</p>';
    const renderFn = compileTestComponent(template);
    const vnode = renderFn({});
    expect(vnode.type).toBe(VDOM.Fragment);
    expect(vnode.children.length).toBe(2);
    expect(vnode.children[0].type).toBe('h1');
    expect(vnode.children[1].type).toBe('p');
  });

  test('should compile comments', () => {
    const template = '<!-- this is a comment -->';
    const renderFn = compileTestComponent(template);
    const vnode = renderFn({});
    expect(vnode.type).toBe(VDOM.Comment);
    expect(vnode.children).toBe(' this is a comment ');
  });
});
