import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { AgentNotFoundSchema, SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { MediaKindSchema } from "../schema.ts";

/** Shared fields present on every media index entry. */
const MediaIndexEntryBaseSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  keywords: z.array(z.string()),
  prompt: z.string().exactOptional(),
  createdAt: z.string().exactOptional(),
});

export const ImageIndexEntrySchema = MediaIndexEntryBaseSchema.extend({
  kind: z.literal("image"),
  width: z.number().exactOptional(),
  height: z.number().exactOptional(),
});

export type ImageIndexEntry = z.output<typeof ImageIndexEntrySchema>;

export const VideoIndexEntrySchema = MediaIndexEntryBaseSchema.extend({
  kind: z.literal("video"),
  width: z.number().exactOptional(),
  height: z.number().exactOptional(),
  duration: z.number().exactOptional(),
});

export type VideoIndexEntry = z.output<typeof VideoIndexEntrySchema>;

export const AudioIndexEntrySchema = MediaIndexEntryBaseSchema.extend({
  kind: z.literal("audio"),
  duration: z.number().exactOptional(),
  sampleRate: z.number().exactOptional(),
  channels: z.number().exactOptional(),
});

export type AudioIndexEntry = z.output<typeof AudioIndexEntrySchema>;

/** Discriminated union of all media index entry kinds. */
export const MediaIndexEntrySchema = z.discriminatedUnion("kind", [ImageIndexEntrySchema, VideoIndexEntrySchema, AudioIndexEntrySchema]);

export type MediaIndexEntry = z.output<typeof MediaIndexEntrySchema>;

const MediaListQuerySchema = z.object({
  search: z.string().exactOptional(),
  limit: z.number().int().positive().default(200).exactOptional(),
  /** When omitted, returns all kinds. When provided, only matching kinds are returned. */
  kind: z.array(MediaKindSchema).exactOptional(),
});

const MediaListResultSchema = z.object({
  media: z.array(MediaIndexEntrySchema),
  count: z.number(),
});

export default {
  name: "Media Library RPC",
  path: "/rpc/media-library",
  methods: {
    getMediaLibraryConfiguration: {
      type: "query",
      input: z.object({}),
      result: z.object({
        agentTypes: z.array(z.string()),
        /** Configured output directory name relative to the workspace (e.g. `media-library`). */
        outputDirectory: z.string(),
        /**
         * Working-directory-relative path for `/api/fs/{provider}/...` URLs.
         * Typically `.tokenring/media-library` when workspaceDirectory is `<working>/.tokenring`.
         */
        serveDirectory: z.string(),
      }),
    },
    /**
     * Unified media list. When `kind` is omitted, returns all kinds.
     * When provided, only entries whose kind is in the list are returned.
     */
    getMedia: {
      type: "query",
      input: MediaListQuerySchema,
      result: MediaListResultSchema,
    },
    /**
     * Unified media stream. When `kind` is omitted, returns all kinds.
     * When provided, only entries whose kind is in the list are returned.
     */
    streamMedia: {
      type: "stream",
      input: MediaListQuerySchema,
      result: MediaListResultSchema,
    },
    getMediaLibraryState: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          selectedFilename: z.string().nullable(),
          selectedKind: MediaKindSchema.nullable(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    updateMediaLibraryState: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        selectedFilename: z.string().exactOptional(),
        selectedKind: MediaKindSchema.exactOptional(),
        clearSelection: z.boolean().exactOptional(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          selectedFilename: z.string().nullable(),
          selectedKind: MediaKindSchema.nullable(),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
