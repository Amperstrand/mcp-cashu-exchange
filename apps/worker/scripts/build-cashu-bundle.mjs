#!/usr/bin/env node
/** Build the browser bundle for the cashu-ts paid leg. */
import { build } from "esbuild";

await build({
  entryPoints: ["apps/worker/src/cashu-browser.ts"],
  bundle: true,
  format: "iife",
  globalName: "CashuPaidLeg",
  target: "es2020",
  outfile: "apps/worker/public/cashu-paid-leg.bundle.js",
  logLevel: "info",
});
