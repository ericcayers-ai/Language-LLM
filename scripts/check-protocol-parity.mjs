#!/usr/bin/env node
/**
 * Protocol drift check: TypeScript PROTOCOL_VERSION and kebab-case enum literals
 * must stay aligned with packages/protocol/rust.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsVersionPath = join(root, "packages/protocol/src/version.ts");
const tsTypesPath = join(root, "packages/protocol/src/types.ts");
const rustPath = join(root, "packages/protocol/rust/src/lib.rs");

const tsVersionSrc = readFileSync(tsVersionPath, "utf8");
const tsTypesSrc = readFileSync(tsTypesPath, "utf8");
const rustSrc = readFileSync(rustPath, "utf8");

const errors = [];

const tsVer = tsVersionSrc.match(
  /PROTOCOL_VERSION\s*=\s*"([^"]+)"/,
)?.[1];
const rustVer = rustSrc.match(
  /PROTOCOL_VERSION:\s*&str\s*=\s*"([^"]+)"/,
)?.[1];

if (!tsVer || !rustVer) {
  errors.push("could not parse PROTOCOL_VERSION from TS and/or Rust");
} else if (tsVer !== rustVer) {
  errors.push(`PROTOCOL_VERSION drift: TS=${tsVer} Rust=${rustVer}`);
}

/** @param {string} name */
function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * @param {string} src
 * @param {string} name
 */
function extractTsUnion(src, name) {
  const re = new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`);
  const block = src.match(re)?.[1];
  if (!block) return null;
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
}

/**
 * @param {string} src
 * @param {string} enumName
 */
function extractRustEnum(src, enumName) {
  const headerRe = new RegExp(
    `pub enum ${enumName}\\s*\\{`,
  );
  const headerIdx = src.search(headerRe);
  if (headerIdx < 0) return null;

  // Look back for serde rename_all on the attributes immediately above.
  const before = src.slice(Math.max(0, headerIdx - 400), headerIdx);
  const renameAll = before.match(
    /#\[serde\([^\]]*rename_all\s*=\s*"([^"]+)"[^\]]*\)\]/,
  )?.[1];

  const open = src.indexOf("{", headerIdx);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const block = src.slice(open + 1, end);

  const variants = [];
  for (const line of block.split("\n")) {
    const rename = line.match(/#\[serde\(rename\s*=\s*"([^"]+)"\)\]/);
    if (rename) {
      // Next non-attribute line is the variant; handled when we see the name.
      variants.push({ pendingRename: rename[1] });
      continue;
    }
    const bare = line.match(/^\s*([A-Z][A-Za-z0-9]*)\s*,?\s*$/);
    if (!bare) continue;
    const pending = variants.find((v) => v.pendingRename && !v.value);
    if (pending) {
      pending.value = pending.pendingRename;
      delete pending.pendingRename;
      continue;
    }
    if (renameAll === "kebab-case") {
      variants.push({ value: toKebab(bare[1]) });
    } else if (renameAll === "snake_case") {
      variants.push({
        value: bare[1]
          .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
          .toLowerCase(),
      });
    } else {
      variants.push({ value: toKebab(bare[1]) });
    }
  }

  return variants
    .map((v) => v.value)
    .filter(Boolean)
    .sort();
}

const pairs = [
  ["Provenance", "Provenance"],
  ["HardwareProfile", "HardwareProfile"],
  ["PowerPolicy", "PowerPolicy"],
  ["LanguageTier", "LanguageTier"],
  ["ModelLicenseClass", "ModelLicenseClass"],
  ["JobKind", "JobKind"],
  ["JobStatus", "JobStatus"],
  ["WordStatus", "WordStatus"],
];

for (const [tsName, rustName] of pairs) {
  const ts = extractTsUnion(tsTypesSrc, tsName);
  const rust = extractRustEnum(rustSrc, rustName);
  if (!ts) {
    errors.push(`missing TS union ${tsName}`);
    continue;
  }
  if (!rust) {
    errors.push(`missing Rust enum ${rustName}`);
    continue;
  }
  const tsSet = new Set(ts);
  const rustSet = new Set(rust);
  for (const v of ts) {
    if (!rustSet.has(v)) {
      errors.push(`${tsName}: TS has "${v}" missing in Rust`);
    }
  }
  for (const v of rust) {
    if (!tsSet.has(v)) {
      errors.push(`${rustName}: Rust has "${v}" missing in TS`);
    }
  }
}

if (errors.length) {
  console.error("protocol parity check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `protocol parity ok: version ${tsVer}, ${pairs.length} enums aligned`,
);
