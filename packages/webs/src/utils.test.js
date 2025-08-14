import { is_object, is_string, is_function, void_elements } from "./utils";
import { describe, test, expect } from "bun:test";

describe("Utility Functions", () => {
  describe("is_object", () => {
    test("should return true for objects and arrays", () => {
      expect(is_object({})).toBe(true);
      expect(is_object([])).toBe(true);
      expect(is_object(new Date())).toBe(true);
    });

    test("should return false for null", () => {
      expect(is_object(null)).toBe(false);
    });

    test("should return false for primitives", () => {
      expect(is_object("hello")).toBe(false);
      expect(is_object(123)).toBe(false);
      expect(is_object(true)).toBe(false);
      expect(is_object(undefined)).toBe(false);
    });
  });

  describe("is_string", () => {
    test("should return true for strings", () => {
      expect(is_string("hello")).toBe(true);
      expect(is_string("")).toBe(true);
    });

    test("should return false for non-strings", () => {
      expect(is_string(123)).toBe(false);
      expect(is_string({})).toBe(false);
      expect(is_string(null)).toBe(false);
      expect(is_string(undefined)).toBe(false);
    });
  });

  describe("is_function", () => {
    test("should return true for functions", () => {
      expect(is_function(() => { })).toBe(true);
      expect(is_function(function() { })).toBe(true);
    });

    test("should return false for non-functions", () => {
      expect(is_function({})).toBe(false);
      expect(is_function("hello")).toBe(false);
      expect(is_function(123)).toBe(false);
    });
  });

  describe("void_elements", () => {
    test("should be a Set", () => {
      expect(void_elements).toBeInstanceOf(Set);
    });

    test("should contain common void elements", () => {
      expect(void_elements.has("br")).toBe(true);
      expect(void_elements.has("hr")).toBe(true);
      expect(void_elements.has("img")).toBe(true);
      expect(void_elements.has("input")).toBe(true);
    });

    test("should not contain non-void elements", () => {
      expect(void_elements.has("div")).toBe(false);
      expect(void_elements.has("p")).toBe(false);
    });
  });
});
