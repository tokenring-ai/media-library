import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import MediaLibraryService from "../MediaLibraryService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const mediaLibrary = agent.requireServiceByType(MediaLibraryService);
  const count = await mediaLibrary.reindex(agent);
  return `Media library re-indexed successfully. ${count} files indexed.`;
}

export default {
  name: "media reindex",
  description: "Reindex the media library directory",
  inputSchema,
  execute,
  help: `Regenerate the media_index.json file by scanning images, videos, and audio files in the media library directory.

## Example

/media reindex`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
