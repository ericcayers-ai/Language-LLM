#!/usr/bin/env node
/**
 * Local + CI verification gate for Language-LLM.
 *
 * Usage:
 *   pnpm verify
 *   node scripts/verify.mjs --skip-install
 *   node scripts/verify.mjs --quick
 *   VERIFY_TAURI_GUI=1 node scripts/verify.mjs --skip-install
 *
 * Flags:
 *   --skip-install     Skip pnpm install
 *   --skip-rust        Skip fmt/clippy/cargo test/check
 *   --skip-build       Skip extension zip/build and Tauri/cargo check
 *   --skip-playwright  Skip Playwright extension suite
 *   --quick            Skip builds, playwright, clippy (still runs tests + validators)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipInstall = args.has("--skip-install");
const skipRust = args.has("--skip-rust");
const skipBuild = args.has("--skip-build") || args.has("--quick");
const skipPlaywright =
  args.has("--skip-playwright") ||
  args.has("--quick") ||
  process.env.VERIFY_SKIP_PLAYWRIGHT === "1";
const skipClippy = args.has("--quick");
const wantGui =
  process.env.VERIFY_TAURI_GUI === "1" || args.has("--tauri-gui");

function run(cmd, cmdArgs, label, opts = {}) {
  console.log(`\n==> ${label}\n$ ${cmd} ${cmdArgs.join(" ")}\n`);
  const result = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if (result.status !== 0) {
    console.error(`\nverify failed: ${label} (exit ${result.status ?? "?"})`);
    process.exit(result.status ?? 1);
  }
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const cargo = "cargo";
const nodeBin = "node";

if (!skipInstall) {
  const lock = join(root, "pnpm-lock.yaml");
  const installArgs = existsSync(lock)
    ? ["install", "--frozen-lockfile"]
    : ["install"];
  run(pnpm, installArgs, "pnpm install");
}

run(nodeBin, ["scripts/validate-catalog.mjs"], "catalog validation");
run(nodeBin, ["scripts/validate-licenses.mjs"], "license validation");
run(nodeBin, ["scripts/check-protocol-parity.mjs"], "protocol parity");
run(nodeBin, ["scripts/validate-native-host.mjs"], "native-host scripts");

run(
  pnpm,
  [
    "-r",
    "--filter",
    "!@language-llm/extension",
    "--filter",
    "!@language-llm/extension-e2e",
    "typecheck",
  ],
  "package typecheck",
);
run(
  pnpm,
  ["--filter", "@language-llm/extension", "typecheck"],
  "extension typecheck",
);

run(
  pnpm,
  [
    "-r",
    "--filter",
    "!@language-llm/extension-e2e",
    "lint",
  ],
  "pnpm lint (tsc --noEmit where configured)",
);

run(
  pnpm,
  [
    "-r",
    "--filter",
    "!@language-llm/extension",
    "--filter",
    "!@language-llm/extension-e2e",
    "test",
  ],
  "package tests",
);
run(pnpm, ["--filter", "@language-llm/extension", "test"], "extension tests");
run(pnpm, ["--filter", "@language-llm/benchmarks", "test"], "benchmark suites");

if (!skipRust) {
  run(cargo, ["fmt", "--all", "--", "--check"], "cargo fmt --check");
  if (!skipClippy) {
    run(
      cargo,
      [
        "clippy",
        "--workspace",
        "--all-targets",
        "--",
        "-D",
        "warnings",
      ],
      "cargo clippy",
    );
  }
  run(cargo, ["test", "--workspace"], "cargo test --workspace");
}

if (!skipBuild) {
  run(
    pnpm,
    ["--filter", "@language-llm/extension", "build"],
    "extension production build (wxt)",
  );
  run(
    pnpm,
    ["--filter", "@language-llm/desktop", "build"],
    "desktop frontend build",
  );

  if (!skipRust) {
    run(
      cargo,
      ["check", "-p", "language-llm-desktop"],
      "Tauri crate check (headless default)",
    );
    if (wantGui) {
      run(
        cargo,
        ["check", "-p", "language-llm-desktop", "--features", "gui"],
        "Tauri crate check (gui feature)",
      );
    } else {
      console.log(
        "\n(skip) Tauri gui feature check — set VERIFY_TAURI_GUI=1 or pass --tauri-gui\n",
      );
    }
  }
}

if (!skipPlaywright) {
  const e2ePkg = join(root, "apps/extension/e2e/package.json");
  if (existsSync(e2ePkg)) {
    run(
      pnpm,
      ["--filter", "@language-llm/extension-e2e", "test"],
      "Playwright extension e2e",
    );
  } else {
    console.log("\n(skip) Playwright package not present\n");
  }
}

console.log("\nverify ok: quality gates green\n");
if (!wantGui) {
  console.log(
    "note: Tauri gui feature was not checked (VERIFY_TAURI_GUI / --tauri-gui).",
  );
}
console.log(
  "external blockers (not covered here): model weights, signing secrets, CWS credentials,",
);
console.log(
  "  macOS icon.icns tooling, manual YouTube SPA + tabCapture gates — see apps/extension/e2e/MANUAL_GATES.md\n",
);
