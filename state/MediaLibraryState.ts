import type { Agent } from "@tokenring-ai/agent";
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import { z } from "zod";
import { type MediaKind, MediaKindSchema } from "../schema.ts";

const serializationSchema = z.object({
  selectedFilename: z.string().optional(),
  selectedKind: MediaKindSchema.optional(),
  lastAttachedFilename: z.string().optional(),
});

export class MediaLibraryState extends AgentStateSlice<typeof serializationSchema> {
  selectedFilename: string | undefined;
  selectedKind: MediaKind | undefined;
  lastAttachedFilename: string | undefined;

  constructor() {
    super("MediaLibraryState", serializationSchema);
  }

  transferStateFromParent(parent: Agent): void {
    const parentState = parent.getState(MediaLibraryState);
    this.selectedFilename ??= parentState.selectedFilename;
    this.selectedKind ??= parentState.selectedKind;
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      selectedFilename: this.selectedFilename,
      selectedKind: this.selectedKind,
      lastAttachedFilename: this.lastAttachedFilename,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.selectedFilename = data.selectedFilename;
    this.selectedKind = data.selectedKind;
    this.lastAttachedFilename = data.lastAttachedFilename;
  }

  show(): string {
    return `Selected Media: ${this.selectedFilename ? `${this.selectedFilename}${this.selectedKind ? ` (${this.selectedKind})` : ""}` : "None"}
    Last Attached Filename: ${this.lastAttachedFilename ?? "None"}`;
  }
}
