import { PROTOCOL_VERSION } from "./version.js";

export interface VersionParts {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export function parseSemver(version: string): VersionParts | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: version.trim(),
  };
}

/** Major versions must match; client minor/patch may lag within the same major. */
export function versionsCompatible(
  clientVersion: string,
  companionVersion: string = PROTOCOL_VERSION,
): boolean {
  const client = parseSemver(clientVersion);
  const companion = parseSemver(companionVersion);
  if (!client || !companion) return false;
  return client.major === companion.major;
}

export type VersionSkew =
  | { kind: "compatible"; client: VersionParts; companion: VersionParts }
  | { kind: "major-mismatch"; client: VersionParts; companion: VersionParts }
  | { kind: "invalid"; clientRaw: string; companionRaw: string };

export function checkVersionSkew(
  clientVersion: string,
  companionVersion: string = PROTOCOL_VERSION,
): VersionSkew {
  const client = parseSemver(clientVersion);
  const companion = parseSemver(companionVersion);
  if (!client || !companion) {
    return {
      kind: "invalid",
      clientRaw: clientVersion,
      companionRaw: companionVersion,
    };
  }
  if (client.major !== companion.major) {
    return { kind: "major-mismatch", client, companion };
  }
  return { kind: "compatible", client, companion };
}

export function isClientAhead(
  clientVersion: string,
  companionVersion: string = PROTOCOL_VERSION,
): boolean {
  const client = parseSemver(clientVersion);
  const companion = parseSemver(companionVersion);
  if (!client || !companion || client.major !== companion.major) return false;
  if (client.minor !== companion.minor) return client.minor > companion.minor;
  return client.patch > companion.patch;
}
