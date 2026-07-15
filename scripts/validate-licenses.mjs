#!/usr/bin/env node
/**
 * Validate license governance docs + catalog alignment for release gating.
 * Does not embed secrets; rejects research packs marked as commercial defaults.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const requiredDocs = [
  "LICENSE",
  "docs/licenses/model-matrix.md",
];

for (const rel of requiredDocs) {
  if (!existsSync(join(root, rel))) {
    errors.push(`missing ${rel}`);
  }
}

const matrix = readFileSync(join(root, "docs/licenses/model-matrix.md"), "utf8");
for (const needle of [
  "commercial redistributable",
  "research",
  "NLLB",
  "Tower",
  "Kaikki",
  "JMdict",
  "CC-CEDICT",
]) {
  if (!matrix.toLowerCase().includes(needle.toLowerCase())) {
    errors.push(`model-matrix.md missing expected topic: ${needle}`);
  }
}

const catalog = JSON.parse(
  readFileSync(join(root, "models/catalog.json"), "utf8"),
);
for (const model of catalog.models ?? []) {
  if (
    model.licenseClass === "research-opt-in" &&
    model.commercialDefault === true
  ) {
    errors.push(
      `catalog ${model.id}: research-opt-in cannot be commercialDefault`,
    );
  }
}

const rootLicense = readFileSync(join(root, "LICENSE"), "utf8");
if (!/MIT/i.test(rootLicense)) {
  errors.push("root LICENSE should identify MIT (or update this check)");
}

if (errors.length) {
  console.error("license validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("license validation ok");
