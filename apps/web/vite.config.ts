import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: path.resolve(__dirname, "..", ".."),
  plugins: [react()],
  resolve: {
    alias: {
      // Ensure browser-compatible polyfills are used instead of Node built-ins.
      buffer: "buffer/",
      process: "process/browser"
    }
  },
  define: {
    global: "globalThis"
  },
  optimizeDeps: {
    include: ["buffer", "process"]
  },
  server: {
    port: 5173
  }
});
