import { expect, test } from "vitest";

test("provides a browser-like DOM environment", () => {
  expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
});
