import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_url_decode, webs_free_string } = lib.symbols;

function parseUrlWithC(urlString) {
  const urlBuffer = Buffer.from(urlString + '\0');
  const resultPtr = webs_url_decode(urlBuffer);
  if (!resultPtr || resultPtr.ptr === 0) {
    throw new Error('C function webs_url_decode returned null pointer.');
  }
  try {
    const jsonString = new CString(resultPtr).toString();
    const result = JSON.parse(jsonString);
    if (result.error) {
      throw new Error(`${result.error}: ${result.message}`);
    }
    return result;
  } finally {
    webs_free_string(resultPtr);
  }
}

describe('Webs C URL Decoder - Query String Parsing', () => {
  test('should parse simple key-value pairs', () => {
    const result = parseUrlWithC('key1=value1&key2=value2');
    expect(result).toEqual({ key1: 'value1', key2: 'value2' });
  });

  test('should handle URL-encoded characters', () => {
    const result = parseUrlWithC('name=John%20Doe&data=a%2Bb%26c%3D10');
    expect(result).toEqual({ name: 'John Doe', data: 'a+b&c=10' });
  });

  test('should parse keys without values', () => {
    const result = parseUrlWithC('a=&b&c=123');
    expect(result).toEqual({ a: '', b: '', c: '123' });
  });

  test('should parse simple arrays', () => {
    const result = parseUrlWithC('a[]=1&a[]=2&a[]=3');
    expect(result).toEqual({ a: ['1', '2', '3'] });
  });

  test('should parse nested objects', () => {
    const result = parseUrlWithC(
      'user[name]=John&user[email]=john@example.com',
    );
    expect(result).toEqual({
      user: { name: 'John', email: 'john@example.com' },
    });
  });

  test('should parse complex nested structures', () => {
    const queryString =
      'user[name]=Jane&user[hobbies][]=reading&user[hobbies][]=coding&user[address][city]=New%20York';
    const result = parseUrlWithC(queryString);
    expect(result).toEqual({
      user: {
        name: 'Jane',
        hobbies: ['reading', 'coding'],
        address: { city: 'New York' },
      },
    });
  });

  test('should handle an empty string', () => {
    const result = parseUrlWithC('');
    expect(result).toEqual({});
  });

  test('should handle a string with no equals signs', () => {
    const result = parseUrlWithC('a&b&c');
    expect(result).toEqual({ a: '', b: '', c: '' });
  });

  test('should handle malformed percent encoding', () => {
    const result = parseUrlWithC('key=%2G&val=%2');
    expect(result).toEqual({ key: '%2G', val: '%2' });
  });
});

describe('Webs C URL Decoder - Full URL Parsing', () => {
  test('should parse a simple full URL', () => {
    const result = parseUrlWithC('http://example.com/path?a=1&b=2#frag');
    expect(result).toEqual({
      scheme: 'http',
      host: 'example.com',
      path: '/path',
      query: { a: '1', b: '2' },
      fragment: 'frag',
    });
  });

  test('should parse HTTPS URL with a port', () => {
    const result = parseUrlWithC('https://localhost:8080/api/users?id=123');
    expect(result).toEqual({
      scheme: 'https',
      host: 'localhost',
      port: '8080',
      path: '/api/users',
      query: { id: '123' },
    });
  });

  test('should handle URL with only host', () => {
    const result = parseUrlWithC('https://example.com');
    expect(result).toEqual({
      scheme: 'https',
      host: 'example.com',
      path: '/',
      query: {},
    });
  });
});

describe('Webs C URL Route Matcher', () => {
  const { webs_match_route, webs_free_string } = lib.symbols;

  function matchRoute(pattern, path) {
    const patternBuffer = Buffer.from(pattern + '\0');
    const pathBuffer = Buffer.from(path + '\0');
    const resultPtr = webs_match_route(patternBuffer, pathBuffer);

    try {
      if (!resultPtr || resultPtr.ptr === 0) {
        return null;
      }
      const jsonString = new CString(resultPtr).toString();
      const result = JSON.parse(jsonString);
      if (result && result.error) {
        return { error: result.message };
      }
      return result;
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }
  }

  test('should match static routes', () => {
    expect(matchRoute('/users/all', '/users/all')).toEqual({});
    expect(matchRoute('/users/all', '/users/specific')).toBeNull();
  });

  test('should extract dynamic parameters', () => {
    expect(matchRoute('/users/[id]', '/users/123')).toEqual({ id: '123' });
    expect(matchRoute('/posts/[year]/[month]', '/posts/2023/11')).toEqual({
      year: '2023',
      month: '11',
    });
  });

  test('should handle catch-all parameters', () => {
    expect(matchRoute('/files/[...filepath]', '/files/a/b/c.txt')).toEqual({
      filepath: ['a', 'b', 'c.txt'],
    });
    expect(matchRoute('/docs/[...slug]', '/docs/getting-started')).toEqual({
      slug: ['getting-started'],
    });
  });

  test('should return null for non-matching paths', () => {
    expect(matchRoute('/users/[id]', '/users/123/details')).toBeNull();
    expect(matchRoute('/users/[id]/details', '/users/123')).toBeNull();
    expect(matchRoute('/users/[id]', '/pages/123')).toBeNull();
  });

  test('should handle URL-encoded path segments', () => {
    expect(matchRoute('/users/[name]', '/users/John%20Doe')).toEqual({
      name: 'John Doe',
    });
  });

  test('should handle consecutive dynamic parameters', () => {
    expect(matchRoute('/[lang]-[region]', '/en-US')).toEqual({
      lang: 'en',
      region: 'US',
    });
  });
});
