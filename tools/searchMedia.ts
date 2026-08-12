import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import { z } from "zod";
import MediaLibraryService from "../MediaLibraryService.ts";

const name = "media_search";
const displayName = "Media Library/search";

async function execute({ query, kind, limit }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const mediaLibrary = agent.requireService(MediaLibraryService);
  const results = await mediaLibrary.search(query, { kind, limit }, agent);

  if (results.length === 0) {
    return {
      message: `**Media Library** Searched for ${query}`,
      result: `No media files matching "${query}" were found.`,
    };
  }

  return {
    message: `**Media Library** Found ${results.length} media file(s) matching "${query}"`,
    result: `
Found ${results.length} media file(s) matching "${query}":

${markdownTable(
  ["Score", "Kind", "Filename", "Prompt", "Keywords"],
  results.map(entry => [entry.score.toFixed(2), entry.kind, entry.filename, entry.prompt ?? "—", entry.keywords.length > 0 ? entry.keywords.join(", ") : "—"]),
)}
`.trim(),
  };
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
