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

export const MediaLibraryAgentConfigSchema = z
  .object({
    outputDirectory: z.string().exactOptional(),
  })
  .default({});

export const MediaLibraryServiceConfigSchema = z
  .object({
    staticPath: z
      .string()
      .default("/api/media")
      .meta({ restartRequired: true, advanced: true, description: "URL path media files are served under" } satisfies ConfigFieldMeta),
    agentDefaults: z
      .object({
        outputDirectory: z.string().meta({ description: "Directory generated media files are written to" } satisfies ConfigFieldMeta),
      })
      .meta({ label: "Agent Defaults" } satisfies ConfigFieldMeta),
  })
  .meta({ label: "Media Library", description: "Storage for agent-generated images, video, and audio" } satisfies ConfigFieldMeta);

export type MediaLibraryServiceConfig = z.input<typeof MediaLibraryServiceConfigSchema>;
export type ParsedMediaLibraryConfig = z.output<typeof MediaLibraryServiceConfigSchema>;
