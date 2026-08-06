import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // ~700 KB of Pokémon data ships inlined. Emitting it as JSON.parse("…")
  // instead of a JS object literal parses ~2x faster in V8 (string scan vs.
  // full AST), which directly cuts bundle.html boot time.
  json: { stringify: true },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
