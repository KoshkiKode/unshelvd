import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split heavy third-party libraries into separate cached chunks so that
        // changes to application code don't bust the cache for unrelated deps.
        manualChunks(id) {
          if (/node_modules\/(recharts|d3-)/.test(id)) return "vendor-charts";
          if (/node_modules\/framer-motion\//.test(id)) return "vendor-motion";
          if (/node_modules\/@stripe\//.test(id)) return "vendor-stripe";
          if (/node_modules\/@radix-ui\//.test(id)) return "vendor-radix";
          if (/node_modules\/(react|react-dom)\//.test(id)) return "vendor-react";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
