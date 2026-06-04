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

export const MediaLibraryServiceConfigSchema = z.object({
  staticPath: z.string().default("/api/media"),
  agentDefaults: z.object({
    outputDirectory: z.string(),
  }),
});

export type MediaLibraryServiceConfig = z.input<typeof MediaLibraryServiceConfigSchema>;
export type ParsedMediaLibraryConfig = z.output<typeof MediaLibraryServiceConfigSchema>;
