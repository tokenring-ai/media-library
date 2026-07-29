import type { Agent } from "@tokenring-ai/agent";
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import { z } from "zod";
import { type MediaKind, MediaKindSchema, type ParsedMediaLibraryConfig } from "../schema.ts";

const serializationSchema = z.object({
  outputDirectory: z.string(),
  selectedFilename: z.string().optional(),
  selectedKind: MediaKindSchema.optional(),
  lastAttachedFilename: z.string().optional(),
});

export class MediaLibraryState extends AgentStateSlice<typeof serializationSchema> {
  outputDirectory: string;
  selectedFilename: string | undefined;
  selectedKind: MediaKind | undefined;
  lastAttachedFilename: string | undefined;

  constructor(readonly initialConfig: ParsedMediaLibraryConfig["agentDefaults"]) {
    super("MediaLibraryState", serializationSchema);
    this.outputDirectory = initialConfig.outputDirectory;
  }

  transferStateFromParent(parent: Agent): void {
    const parentState = parent.getState(MediaLibraryState);
    this.selectedFilename ??= parentState.selectedFilename;
    this.selectedKind ??= parentState.selectedKind;
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      outputDirectory: this.outputDirectory,
      selectedFilename: this.selectedFilename,
      selectedKind: this.selectedKind,
      lastAttachedFilename: this.lastAttachedFilename,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.outputDirectory = data.outputDirectory;
    this.selectedFilename = data.selectedFilename;
    this.selectedKind = data.selectedKind;
    this.lastAttachedFilename = data.lastAttachedFilename;
  }

  show(): string {
    return `Media Library Directory: ${this.outputDirectory}
    Selected Media: ${this.selectedFilename ? `${this.selectedFilename}${this.selectedKind ? ` (${this.selectedKind})` : ""}` : "None"}
    Last Attached Filename: ${this.lastAttachedFilename ?? "None"}`;
  }
}
