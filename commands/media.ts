import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import MediaLibraryService from "../MediaLibraryService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const mediaLibrary = agent.requireService(MediaLibraryService);
  const { total, added, removed, kept } = await mediaLibrary.reindex(agent);
  return `Media library re-indexed successfully: ${added} added, ${removed} removed, ${kept} kept (${total} files indexed).`;
}

export default {
  name: "media reindex",
  description: "Reindex the media library directory",
  inputSchema,
  execute,
  help: `Reconcile media_index.json with the images, videos, and audio files in the media library directory.

Existing index entries are kept as they are (generated media's prompt, keywords and creation time live only in the index), files that are not indexed yet are added from their EXIF/filesystem metadata, and entries whose file was deleted are dropped.

## Example

/media reindex`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
