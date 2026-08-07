import path from "path";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Build fingerprint: a short, stable hash of the app's own source manifest.
// Stamped into the artifact so any deployment can be identified as ours in a
// takedown notice. Falls back to a timestamp-free constant when unreadable so
// builds stay reproducible.
function buildId(): string {
  try {
    const pkg = readFileSync(path.resolve(__dirname, "package.json"), "utf8");
    const lock = readFileSync(path.resolve(__dirname, "pnpm-lock.yaml"), "utf8");
    return createHash("sha256").update(pkg).update(lock).digest("hex").slice(0, 12);
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    // Available to src/lib/provenance.ts.
    __TC_BUILD__: JSON.stringify(buildId()),
  },
  build: {
    // No sourcemaps in production — shipping them would hand over the
    // original TypeScript, which defeats the point of minifying at all.
    sourcemap: false,
  },
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
