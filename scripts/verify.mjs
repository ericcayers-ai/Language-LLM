#!/usr/bin/env node
/**
 * Local + CI verification: pnpm tests/typecheck + cargo workspace tests.
 * Usage: pnpm verify
 *        node scripts/verify.mjs --skip-install
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipInstall = process.argv.includes("--skip-install");

function run(cmd, args, label) {
  console.log(`\n==> ${label}\n$ ${cmd} ${args.join(" ")}\n`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\nverify failed: ${label} (exit ${result.status ?? "?"})`);
    process.exit(result.status ?? 1);
  }
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const cargo = "cargo";

if (!skipInstall) {
  const lock = join(root, "pnpm-lock.yaml");
  const installArgs = existsSync(lock)
    ? ["install", "--frozen-lockfile"]
    : ["install"];
  run(pnpm, installArgs, "pnpm install");
}

run(
  pnpm,
  ["-r", "--filter", "!@language-llm/extension", "test"],
  "pnpm package tests",
);
run(pnpm, ["--filter", "@language-llm/extension", "test"], "extension tests");
run(
  pnpm,
  ["-r", "--filter", "!@language-llm/extension", "typecheck"],
  "pnpm typecheck",
);
run(cargo, ["test", "--workspace"], "cargo test --workspace");

console.log("\nverify ok: pnpm + cargo green\n");
