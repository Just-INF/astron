import { describe, expect, test } from "bun:test";
import { validateCustomCss } from "./theme";

describe("custom CSS boundary", () => {
  test("accepts small privileged declarations", () =>
    expect(() => validateCustomCss({ customCss: ".menu { color: red; }" }, true)).not.toThrow());
  test("rejects imports and dangerous URL schemes", () => {
    expect(() =>
      validateCustomCss({ customCss: '@import "https://evil.example/x.css";' }, true),
    ).toThrow();
    expect(() =>
      validateCustomCss({ customCss: "a{background:url(javascript:alert(1))}" }, true),
    ).toThrow();
  });
  test("rejects custom CSS edits from unprivileged roles", () =>
    expect(() => validateCustomCss({ customCss: ".menu{}" }, false)).toThrow());
});
