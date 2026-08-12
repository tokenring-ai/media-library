import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { z } from "zod";

export const MediaKindSchema = z.enum(["image", "video", "audio"]);
export type MediaKind = z.output<typeof MediaKindSchema>;

export const MediaLibraryEntrySchema = z.object({
  kind: MediaKindSchema,
  filename: z.string(),
  mimeType: z.string(),
  width: z.number().exactOptional(),
  height: z.number().exactOptional(),
  duration: z.number().exactOptional(),
  sampleRate: z.number().exactOptional(),
  channels: z.number().exactOptional(),
  keywords: z.array(z.string()).default([]),
  prompt: z.string().exactOptional(),
  createdAt: z.string().exactOptional(),
});

export type MediaLibraryEntry = z.output<typeof MediaLibraryEntrySchema>;

export const MediaLibraryServiceConfigSchema = z
  .object({
    outputDirectory: z
      .string()
      .default("media-library")
      .meta({ description: "Directory for media files and indexes, relative to the workspace (default: media-library)" } satisfies ConfigFieldMeta),
    agentTypes: z
      .array(z.string())
      .default(["media", "image", "imageGeneration", "video", "videoGeneration", "audio", "voice"])
      .meta({ description: "The available agent types that can be used for media library work" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Media Library", description: "Storage for agent-generated images, video, and audio" } satisfies ConfigFieldMeta);

export type MediaLibraryServiceConfig = z.input<typeof MediaLibraryServiceConfigSchema>;
export type ParsedMediaLibraryConfig = z.output<typeof MediaLibraryServiceConfigSchema>;
