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
    rolldownOptions: {
      output: {
        // @smogon/calc (463 KB) is reached only through the dynamic import in
        // src/lib/calc-loader.ts, so rolldown splits it into its own chunk.
        // Name that chunk `calc-<hash>.js` (rolldown would otherwise call it
        // `dist-<hash>.js`, after the package's dist/index.js). inline.mjs
        // embeds every non-entry chunk in bundle.html as an inert text block
        // and revives it as a Blob-URL module at runtime, so the product stays
        // one self-contained file. Automatic splitting is deliberately left on:
        // a `codeSplitting.groups` config makes rolldown hoist its runtime
        // helpers into a third chunk that the ENTRY imports statically, which
        // an inline module script cannot do.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some(id => /node_modules[\\/]@smogon[\\/]calc[\\/]/.test(id))
            ? 'assets/calc-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  // ~700 KB of Pokémon data ships inlined as object literals. `json.stringify`
  // (JSON.parse("…") emission) was tried on 2026-09-09 (needs
  // `namedExports: false` under Vite 8 / rolldown or it is silently ignored):
  // it added ~26 KB of quoted keys and moved the file:// boot median by
  // 704 → 714 ms (noise) on tests/bench-boot.mjs, so it is intentionally
  // off. The real boot lever is moving @smogon/calc (463 KB, matchup preview
  // only) out of the critical script — see LAUNCH_READINESS.md.
  json: { stringify: false },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
