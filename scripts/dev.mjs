#!/usr/bin/env node
/**
 * One-command dev loop: companion (loopback WS) + extension (watch build).
 *
 * Usage: pnpm dev
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const pnpm = isWin ? "pnpm.cmd" : "pnpm";

function has(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore", shell: isWin }).status === 0;
}

const procs = [];

function prefix(name) {
  return (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter((l) => l.length > 0)
      .forEach((l) => console.log(`[${name}] ${l}`));
}

function launch(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: root, shell: isWin });
  child.stdout.on("data", prefix(name));
  child.stderr.on("data", prefix(name));
  child.on("exit", (code) => {
    console.log(`[${name}] exited (${code})`);
  });
  procs.push(child);
  return child;
}

if (has("cargo")) {
  launch("companion", "cargo", ["run", "-p", "language-llm-desktop", "--", "--serve"]);
} else {
  console.warn(
    "[companion] cargo not found — skipping. Install Rust from https://rustup.rs to run the companion.",
  );
}

launch("extension", pnpm, ["--filter", "@language-llm/extension", "dev"]);

console.log(
  "\nLoad the unpacked extension from apps/extension/.output/chrome-mv3 in chrome://extensions.\nPress Ctrl+C to stop both.\n",
);

function shutdown() {
  for (const p of procs) {
    if (!p.killed) p.kill();
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
