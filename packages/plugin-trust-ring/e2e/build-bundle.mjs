#!/usr/bin/env node
/**
 * build-bundle.mjs — Bundle the REAL plugin-trust-ring source into a single
 * self-contained IIFE file for the browser E2E harness.
 *
 * Uses esbuild to bundle src/index.ts + all its imports (lsag, trustset, prove,
 * verify, gate) together with @noble/curves and @noble/hashes from the repo's
 * node_modules. No crypto is reimplemented — the browser runs the exact same
 * source as the Node tests.
 *
 * We use IIFE format (not ESM) so the harness can be loaded from file://
 * without CORS issues that block ES module imports.
 *
 * Usage:  node e2e/build-bundle.mjs
 * Output: e2e/dist/trust-ring.bundle.js  (IIFE, assigns to window.__trustRing)
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

await build({
  entryPoints: [resolve(__dirname, "..", "src", "index.ts")],
  bundle: true,
  format: "iife",
  globalName: "__trustRing",
  platform: "browser",
  target: "es2022",
  outfile: resolve(__dirname, "dist", "trust-ring.bundle.js"),
  sourcemap: false,
  minify: false,
  // Resolve @noble packages from the repo's node_modules
  absWorkingDir: repoRoot,
  logLevel: "info",
});

console.log("Bundle written to e2e/dist/trust-ring.bundle.js (IIFE, window.__trustRing)");