#!/usr/bin/env node
/**
 * Static checks that native-host register/uninstall scripts exist and mention
 * the expected host name + extension origin wiring (no secrets).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(root, "apps/desktop/scripts");
const HOST = "com.languagellm.companion";

const required = [
  "register-windows.ps1",
  "register-macos.sh",
  "register-linux.sh",
  "uninstall-windows.ps1",
  "uninstall-macos.sh",
  "uninstall-linux.sh",
  "native-host.json",
];

const errors = [];

for (const name of required) {
  const path = join(scriptsDir, name);
  if (!existsSync(path)) {
    errors.push(`missing ${name}`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (!text.includes(HOST)) {
    errors.push(`${name}: does not mention host ${HOST}`);
  }
  if (name.startsWith("register-") && !/allowed_origins|ExtensionId|extension/i.test(text)) {
    errors.push(`${name}: missing extension origin / id wiring`);
  }
}

const manifest = join(scriptsDir, "native-host.json");
if (existsSync(manifest)) {
  const json = JSON.parse(readFileSync(manifest, "utf8"));
  if (json.name !== HOST) {
    errors.push(`native-host.json name must be ${HOST}`);
  }
  if (!Array.isArray(json.allowed_origins)) {
    errors.push("native-host.json must declare allowed_origins array");
  }
}

if (errors.length) {
  console.error("native-host script validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`native-host scripts ok (${required.length} files, host=${HOST})`);
