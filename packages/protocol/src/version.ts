/** Wire protocol version shared by TypeScript and Rust crates. */
export const PROTOCOL_VERSION = "1.0.0" as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
