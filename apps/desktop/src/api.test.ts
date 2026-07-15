import { describe, expect, it } from "vitest";
import { formatBytes, isTauri } from "./api";

describe("desktop api helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toContain("KB");
    expect(formatBytes(5 * 1024 * 1024)).toContain("MB");
  });

  it("detects non-tauri test environment", () => {
    expect(isTauri()).toBe(false);
  });
});
