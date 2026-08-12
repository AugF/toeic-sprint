import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/toeic-sprint/",
  root: "pages",
  publicDir: "../public",
  plugins: [react()],
  build: { outDir: "../pages-dist", emptyOutDir: true },
});
