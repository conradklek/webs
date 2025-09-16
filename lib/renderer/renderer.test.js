import { test, expect, describe } from 'bun:test';
import { createRenderer } from './renderer.dom.js';
import { h, Text } from '../core/vdom.js';

describe('Renderer', () => {
  const createMockNode = (tag, props = {}) => ({
    tag,
    props,
    children: [],
    parentNode: null,
    insertBefore(child, anchor) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      const index = anchor ? this.children.indexOf(anchor) : -1;
      if (index > -1) {
        this.children.splice(index, 0, child);
      } else {
        this.children.push(child);
      }
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index > -1) {
        this.children.splice(index, 1);
        child.parentNode = null;
      }
    },
    get textContent() {
      if (this.tag === '#text' || this.tag === '#comment') {
        return this.props.text;
      }
      return this.children.map((c) => c.textContent).join('');
    },
    set textContent(text) {
      if (this.tag === '#text' || this.tag === '#comment') {
        this.props.text = text;
        return;
      }
      this.children = [
        {
          ...createMockNode('#text', { text }),
          props: { text },
          parentNode: this,
        },
      ];
    },
  });

  const rendererOptions = {
    createElement: (tag) => createMockNode(tag),
    createText: (text) => createMockNode('#text', { text }),
    createComment: (text) => createMockNode('#comment', { text }),
    setElementText: (el, text) => {
      el.textContent = text;
    },
    insert: (child, parent, anchor) => parent.insertBefore(child, anchor),
    remove: (child) => child.parentNode?.removeChild(child),
    patchProp: (el, key, _prevValue, nextValue) => {
      if (nextValue == null) {
        delete el.props[key];
      } else {
        el.props[key] = nextValue;
      }
    },
    querySelector: () => null,
  };

  const { patch } = createRenderer(rendererOptions);

  test('should mount a simple element', () => {
    const container = createMockNode('div');
    const vnode = h('p', null, 'Hello');
    patch(null, vnode, container);

    expect(container.children.length).toBe(1);
    const p = container.children[0];
    expect(p.tag).toBe('p');
    expect(p.textContent).toBe('Hello');
  });

  test('should patch element props', () => {
    const container = createMockNode('div');
    const vnode1 = h('div', { id: 'a' });
    const vnode2 = h('div', { id: 'b', class: 'c' });

    patch(null, vnode1, container);
    patch(vnode1, vnode2, container);

    const el = container.children[0];
    expect(el.props).toEqual({ id: 'b', class: 'c' });
  });

  test('should handle unkeyed children', () => {
    const container = createMockNode('div');
    const vnode1 = h('div', null, [h('p'), h('span')]);
    const vnode2 = h('div', null, [h('p')]);
    const vnode3 = h('div', null, [h('p'), h('span'), h('b')]);

    patch(null, vnode1, container);
    expect(container.children[0].children.map((c) => c.tag)).toEqual([
      'p',
      'span',
    ]);

    patch(vnode1, vnode2, container);
    expect(container.children[0].children.map((c) => c.tag)).toEqual(['p']);

    patch(vnode2, vnode3, container);
    expect(container.children[0].children.map((c) => c.tag)).toEqual([
      'p',
      'span',
      'b',
    ]);
  });

  test('should handle keyed children (list rendering)', () => {
    const container = createMockNode('div');
    const vnode1 = h('div', null, [
      h('p', { key: 1 }, 'A'),
      h('p', { key: 2 }, 'B'),
      h('p', { key: 3 }, 'C'),
    ]);
    const vnode2 = h('div', null, [
      h('p', { key: 3 }, 'C'),
      h('p', { key: 1 }, 'A'),
      h('p', { key: 2 }, 'B'),
    ]);
    const vnode3 = h('div', null, [
      h('p', { key: 3 }, 'C'),
      h('p', { key: 4 }, 'D'),
      h('p', { key: 1 }, 'A'),
      h('p', { key: 2 }, 'B'),
    ]);

    patch(null, vnode1, container);
    expect(container.children[0].textContent).toBe('ABC');

    patch(vnode1, vnode2, container);
    expect(container.children[0].textContent).toBe('CAB');

    patch(vnode2, vnode3, container);
    expect(container.children[0].textContent).toBe('CDAB');
  });

  test('should mount a component', () => {
    const container = createMockNode('div');
    const MyComponent = {
      name: 'MyComponent',
      render: () => h('div', null, 'from component'),
    };
    const vnode = h(MyComponent);
    patch(null, vnode, container);

    expect(container.children[0].tag).toBe('div');
    expect(container.children[0].textContent).toBe('from component');
  });

  test('should unmount an element', () => {
    const container = createMockNode('div');
    const vnode = h('p', null, 'Hello');
    patch(null, vnode, container);
    expect(container.children.length).toBe(1);

    patch(vnode, null, container);
    expect(container.children.length).toBe(0);
  });

  test('should patch text content', () => {
    const container = createMockNode('div');
    const vnode1 = h(Text, null, 'first');
    const vnode2 = h(Text, null, 'second');

    patch(null, vnode1, container);
    expect(container.textContent).toBe('first');

    patch(vnode1, vnode2, container);
    expect(container.textContent).toBe('second');
  });

  test('should replace element with text', () => {
    const container = createMockNode('div');
    const vnode1 = h('p', null, 'text');
    const vnode2 = h(Text, null, 'just text');

    patch(null, vnode1, container);
    expect(container.children[0].tag).toBe('p');

    patch(vnode1, vnode2, container);
    expect(container.children[0].tag).toBe('#text');
    expect(container.textContent).toBe('just text');
  });

  test('should handle keyed children (reversal)', () => {
    const container = createMockNode('div');
    const children1 = [
      h('p', { key: 1 }, 'A'),
      h('p', { key: 2 }, 'B'),
      h('p', { key: 3 }, 'C'),
    ];
    const children2 = [
      h('p', { key: 3 }, 'C'),
      h('p', { key: 2 }, 'B'),
      h('p', { key: 1 }, 'A'),
    ];

    const vnode1 = h('div', null, children1);
    const vnode2 = h('div', null, children2);

    patch(null, vnode1, container);
    expect(container.children[0].textContent).toBe('ABC');

    patch(vnode1, vnode2, container);
    expect(container.children[0].textContent).toBe('CBA');
  });
});
