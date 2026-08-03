#!/usr/bin/env node
/**
 * One-command setup for a fresh machine.
 *
 * Usage: pnpm setup
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const pnpm = isWin ? "pnpm.cmd" : "pnpm";

function has(cmd, args = ["--version"]) {
  const r = spawnSync(cmd, args, { stdio: "ignore", shell: isWin });
  return r.status === 0;
}

function run(cmd, args, label) {
  console.log(`\n==> ${label}\n$ ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`\nsetup failed: ${label} (exit ${r.status ?? "?"})`);
    process.exit(r.status ?? 1);
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  console.error(
    `Node ${process.versions.node} detected — Language-LLM needs Node >= 20. Install from https://nodejs.org/.`,
  );
  process.exit(1);
}

function trySpawn(cmd, args, label) {
  console.log(`\n==> ${label}\n$ ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: isWin });
  return r.status === 0;
}

if (has("corepack", ["--version"])) {
  const enabled = trySpawn("corepack", ["enable"], "corepack enable");
  if (enabled) {
    trySpawn(
      "corepack",
      ["prepare", "pnpm@9.15.0", "--activate"],
      "activate pinned pnpm",
    );
  } else {
    console.warn(
      "corepack enable failed (often needs admin rights on Windows) — continuing with the pnpm already on your PATH.",
    );
  }
} else if (!has(pnpm)) {
  console.error(
    "Neither corepack nor pnpm found on PATH. Install Node >= 16.9 (ships corepack) from https://nodejs.org/, " +
      "or install pnpm directly: https://pnpm.io/installation",
  );
  process.exit(1);
}

if (!has(pnpm)) {
  console.error("pnpm still not found on PATH after corepack setup. See https://pnpm.io/installation.");
  process.exit(1);
}

run(pnpm, ["install"], "pnpm install (all workspaces)");

const hasRust = has("cargo");
if (!hasRust) {
  console.warn(
    "\ncargo/rustc not found — the desktop companion (Tauri, native ASR/MT) needs Rust.\n" +
      "Install via https://rustup.rs, then re-run `pnpm setup`.\n" +
      "You can still run `pnpm --filter @language-llm/extension dev` without Rust.\n",
  );
} else {
  run(
    "cargo",
    ["build", "-p", "language-llm-desktop"],
    "build companion binary (debug, headless-capable)",
  );
}

console.log(`
setup complete.

Next steps:
  1. pnpm dev
       Starts the companion (loopback WS) and the extension in watch mode.
  2. In Chrome, open chrome://extensions, enable Developer mode, "Load unpacked",
     and pick apps/extension/.output/chrome-mv3
  3. (optional, for native messaging) copy the extension ID from chrome://extensions
     and run the register script for your OS — see apps/desktop/scripts/README.md
`);
if (!hasRust) {
  console.log("Rust was not found, so step 1 will only start the extension — see warning above.\n");
}
