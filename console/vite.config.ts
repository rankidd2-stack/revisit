import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The console imports the real domain code from ../src, so the demo runs the same rules as production.
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", emptyOutDir: true },
});
