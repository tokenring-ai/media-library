import type { MediaIndexEntry } from "@tokenring-ai/media-library/rpc/schema";

export type MediaKind = MediaIndexEntry["kind"];
export type MediaEntry = MediaIndexEntry;

/**
 * Resolves the agent the media RPCs need, creating one on demand. Generation,
 * transcription and "work on this" all take an `agentId`.
 */
export type EnsureAgent = (preferredTypes?: readonly string[]) => Promise<string | null>;
