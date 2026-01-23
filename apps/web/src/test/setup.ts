import "@testing-library/jest-dom/vitest";

Object.defineProperty(navigator, "onLine", {
  value: true,
  configurable: true
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
