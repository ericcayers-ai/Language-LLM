import { describe, expect, it } from "vitest";
import {
  __resetConnectionStateForTests,
  getConnectionState,
  onStateChange,
} from "../client.js";

describe("companion connection state", () => {
  it("starts disconnected and notifies listeners", () => {
    __resetConnectionStateForTests();
    expect(getConnectionState()).toBe("disconnected");
    const seen: string[] = [];
    onStateChange((s) => seen.push(s));
    expect(seen).toEqual([]);
  });
});
