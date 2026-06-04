import { AgentStateSlice } from "@tokenring-ai/agent/types";
import { z } from "zod";
import type { ParsedMediaLibraryConfig } from "../schema.ts";

const serializationSchema = z.object({
  outputDirectory: z.string(),
});

export class MediaLibraryState extends AgentStateSlice<typeof serializationSchema> {
  outputDirectory: string;

  constructor(readonly initialConfig: ParsedMediaLibraryConfig["agentDefaults"]) {
    super("MediaLibraryState", serializationSchema);
    this.outputDirectory = initialConfig.outputDirectory;
  }

  serialize(): z.output<typeof serializationSchema> {
    return { outputDirectory: this.outputDirectory };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.outputDirectory = data.outputDirectory;
  }

  show(): string {
    return `Media Library Directory: ${this.outputDirectory}`;
  }
}
