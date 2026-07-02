import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { MediaLibraryEntrySchema } from "../schema.ts";

export const AudioIndexEntrySchema = MediaLibraryEntrySchema.extend({
  kind: z.literal("audio"),
});

export type AudioIndexEntry = z.output<typeof AudioIndexEntrySchema>;

export const ImageIndexEntrySchema = z.object({
  kind: z.literal("image").default("image"),
  filename: z.string(),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
  keywords: z.array(z.string()),
});

export type ImageIndexEntry = z.output<typeof ImageIndexEntrySchema>;

export const VideoIndexEntrySchema = MediaLibraryEntrySchema.extend({
  kind: z.literal("video"),
});

export type VideoIndexEntry = z.output<typeof VideoIndexEntrySchema>;

export default {
  name: "Media Library RPC",
  path: "/rpc/media-library",
  methods: {
    getAudios: {
      type: "query",
      input: z.object({
        search: z.string().exactOptional(),
        limit: z.number().int().positive().default(200).exactOptional(),
      }),
      result: z.object({
        audios: z.array(AudioIndexEntrySchema),
        count: z.number(),
      }),
    },
    streamAudios: {
      type: "stream",
      input: z.object({
        search: z.string().exactOptional(),
        limit: z.number().int().positive().default(200).exactOptional(),
      }),
      result: z.object({
        audios: z.array(AudioIndexEntrySchema),
        count: z.number(),
      }),
    },
    getImages: {
      type: "query",
      input: z.object({
        search: z.string().exactOptional(),
        limit: z.number().int().positive().default(200).exactOptional(),
      }),
      result: z.object({
        images: z.array(ImageIndexEntrySchema),
        count: z.number(),
      }),
    },
    streamImages: {
      type: "stream",
      input: z.object({
        search: z.string().exactOptional(),
        limit: z.number().int().positive().default(200).exactOptional(),
      }),
      result: z.object({
        images: z.array(ImageIndexEntrySchema),
        count: z.number(),
      }),
    },
    getVideos: {
      type: "query",
      input: z.object({
        search: z.string().exactOptional(),
        limit: z.number().int().positive().default(200).exactOptional(),
      }),
      result: z.object({
        videos: z.array(VideoIndexEntrySchema),
        count: z.number(),
      }),
    },
    streamVideos: {
      type: "stream",
      input: z.object({
        search: z.string().exactOptional(),
        limit: z.number().int().positive().default(200).exactOptional(),
      }),
      result: z.object({
        videos: z.array(VideoIndexEntrySchema),
        count: z.number(),
      }),
    },
  },
} satisfies RPCSchema;