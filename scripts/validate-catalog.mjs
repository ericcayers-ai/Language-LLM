#!/usr/bin/env node
/**
 * Validate models/catalog.json structure, license classes, and default-pack rules.
 * Research-opt-in packs must never be commercialDefault.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "models", "catalog.json");

const ALLOWED_LICENSE = new Set([
  "commercial-default",
  "optional",
  "research-opt-in",
]);
const ALLOWED_HARDWARE = new Set(["lite", "balanced", "quality", "workstation"]);
const ALLOWED_TASK = new Set([
  "asr",
  "mt",
  "vlm",
  "aligner",
  "align",
  "ast",
  "qe",
]);

const raw = readFileSync(catalogPath, "utf8");
/** @type {Record<string, unknown>} */
const catalog = JSON.parse(raw);

const errors = [];

if (typeof catalog.catalogVersion !== "string" || !catalog.catalogVersion) {
  errors.push("catalogVersion must be a non-empty string");
}
if (typeof catalog.signed !== "boolean") {
  errors.push("signed must be a boolean");
}
if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
  errors.push("models must be a non-empty array");
}

const ids = new Set();
for (const [i, model] of (catalog.models ?? []).entries()) {
  const prefix = `models[${i}]`;
  if (!model || typeof model !== "object") {
    errors.push(`${prefix}: not an object`);
    continue;
  }
  const m = /** @type {Record<string, unknown>} */ (model);
  if (typeof m.id !== "string" || !m.id) {
    errors.push(`${prefix}: missing id`);
  } else if (ids.has(m.id)) {
    errors.push(`${prefix}: duplicate id ${m.id}`);
  } else {
    ids.add(m.id);
  }

  if (typeof m.licenseClass !== "string" || !ALLOWED_LICENSE.has(m.licenseClass)) {
    errors.push(
      `${prefix} (${m.id}): licenseClass must be one of ${[...ALLOWED_LICENSE].join(", ")}`,
    );
  }
  if (typeof m.commercialDefault !== "boolean") {
    errors.push(`${prefix} (${m.id}): commercialDefault must be boolean`);
  }
  if (m.licenseClass === "research-opt-in" && m.commercialDefault === true) {
    errors.push(
      `${prefix} (${m.id}): research-opt-in must not be commercialDefault`,
    );
  }
  if (m.commercialDefault === true && m.licenseClass === "research-opt-in") {
    errors.push(
      `${prefix} (${m.id}): commercial default cannot be research-opt-in`,
    );
  }
  if (
    typeof m.hardwareMin === "string" &&
    !ALLOWED_HARDWARE.has(m.hardwareMin)
  ) {
    errors.push(`${prefix} (${m.id}): invalid hardwareMin ${m.hardwareMin}`);
  }
  if (typeof m.task === "string" && !ALLOWED_TASK.has(m.task)) {
    // Soft warn only — catalog may introduce new tasks; still record as error for unknown.
    errors.push(`${prefix} (${m.id}): unknown task ${m.task}`);
  }
  if (typeof m.sha256Placeholder !== "string" || !m.sha256Placeholder) {
    errors.push(`${prefix} (${m.id}): missing sha256Placeholder`);
  }
  if (m.commercialDefault === true && typeof m.family !== "string") {
    errors.push(`${prefix} (${m.id}): commercialDefault packs need family`);
  }
}

const commercialDefaults = [...ids].filter((id) => {
  const m = catalog.models.find((x) => x && x.id === id);
  return m?.commercialDefault === true;
});
if (commercialDefaults.length === 0) {
  errors.push("at least one commercialDefault model is required");
}

if (errors.length) {
  console.error("catalog validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `catalog ok: ${ids.size} models, ${commercialDefaults.length} commercial defaults, signed=${catalog.signed}`,
);
