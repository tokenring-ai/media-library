import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import MediaLibraryService from "../MediaLibraryService.ts";

const name = "media_search";
const displayName = "Media Library/search";

async function execute({ query, kind, limit  }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const mediaLibrary = agent.requireServiceByType(MediaLibraryService);
  const results = await mediaLibrary.search(query, { kind, limit }, agent);

  return JSON.stringify({
    results,
    message: `Found ${results.length} media files matching "${query}"`,
  });
}

const description = "Search for media library entries by filename, prompt, or keywords";

const inputSchema = z.object({
  query: z.string().describe("Search query to match against media metadata"),
  kind: z.enum(["image", "video", "audio"]).describe("Optional media kind filter").exactOptional(),
  limit: z.number().int().positive().default(10).describe("Maximum number of results to return"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
