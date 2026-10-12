import { AgentManager } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import MediaLibraryService from "../MediaLibraryService.ts";
import type { MediaKind, MediaLibraryEntry } from "../schema.ts";
import { MediaLibraryState } from "../state/MediaLibraryState.ts";
import type { MediaIndexEntry } from "./schema.ts";
import MediaLibraryRpcSchema from "./schema.ts";

type MediaListArgs = {
  search?: string;
  limit?: number;
  kind?: MediaKind[];
};

function projectMediaEntry(entry: MediaLibraryEntry): MediaIndexEntry {
  const base = {
    filename: entry.filename,
    mimeType: entry.mimeType,
    keywords: entry.keywords,
    ...(entry.prompt !== undefined && { prompt: entry.prompt }),
    ...(entry.createdAt !== undefined && { createdAt: entry.createdAt }),
  };

  if (entry.kind === "image") {
    return {
      kind: "image",
      ...base,
      ...(entry.width !== undefined && { width: entry.width }),
      ...(entry.height !== undefined && { height: entry.height }),
    };
  }

  if (entry.kind === "video") {
    return {
      kind: "video",
      ...base,
      ...(entry.width !== undefined && { width: entry.width }),
      ...(entry.height !== undefined && { height: entry.height }),
      ...(entry.duration !== undefined && { duration: entry.duration }),
    };
  }

  return {
    kind: "audio",
    ...base,
    ...(entry.duration !== undefined && { duration: entry.duration }),
    ...(entry.sampleRate !== undefined && { sampleRate: entry.sampleRate }),
    ...(entry.channels !== undefined && { channels: entry.channels }),
  };
}

async function projectMedia(args: MediaListArgs, app: TokenRingApp) {
  const mediaLibrary = app.requireService(MediaLibraryService);
  // Absolute workspace path so Node-fs reads work without an agent.
  let entries = await mediaLibrary.getEntriesFromDirectory(mediaLibrary.getOutputDirectory(), {
    search: args.search,
  });

  if (args.kind !== undefined) {
    const kinds = new Set(args.kind);
    entries = entries.filter(entry => kinds.has(entry.kind));
  }

  const limited = entries.slice(0, args.limit ?? 200);

  return {
    media: limited.map(projectMediaEntry),
    count: entries.length,
  };
}

const streamMedia = createPollingQueryStream({
  intervalMs: 10000,
  poll: projectMedia,
});

export default createRPCEndpoint(MediaLibraryRpcSchema, {
  async reindexMedia(_args, app: TokenRingApp) {
    return app.requireService(MediaLibraryService).reindex();
  },

  async mediaFileExists(args, app: TokenRingApp) {
    return { exists: await app.requireService(MediaLibraryService).mediaFileExists(args.filename) };
  },

  async deleteMedia(args, app: TokenRingApp) {
    const { clearedSelections } = await app.requireService(MediaLibraryService).deleteMedia(args.filename);
    return { success: true, clearedSelections };
  },

  async renameMedia(args, app: TokenRingApp) {
    const entry = await app.requireService(MediaLibraryService).renameMedia(args.filename, args.newFilename);
    return { entry: projectMediaEntry(entry) };
  },

  async updateMediaKeywords(args, app: TokenRingApp) {
    const entry = await app.requireService(MediaLibraryService).updateKeywords(args.filename, args.keywords);
    return { entry: projectMediaEntry(entry) };
  },

  async importMedia(args, app: TokenRingApp) {
    const buffer = Buffer.from(args.contentBase64, "base64");
    const entry = await app.requireService(MediaLibraryService).importMedia({ filename: args.filename, buffer, overwrite: args.overwrite });
    return { entry: projectMediaEntry(entry) };
  },

  getMediaLibraryConfiguration(_args, app: TokenRingApp) {
    const mediaLibrary = app.requireService(MediaLibraryService);

    return {
      agentTypes: mediaLibrary.getAgentTypes(),
      outputDirectory: mediaLibrary.getOutputDirectoryName(),
      serveDirectory: mediaLibrary.getServeDirectory(),
    };
  },

  async getMedia(args, app: TokenRingApp) {
    return projectMedia(args, app);
  },

  streamMedia,

  getMediaLibraryState(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const state = agent.getState(MediaLibraryState);
    return {
      status: "success",
      selectedFilename: state.selectedFilename ?? null,
      selectedKind: state.selectedKind ?? null,
    };
  },

  updateMediaLibraryState(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const mediaLibrary = app.requireService(MediaLibraryService);

    if (args.clearSelection) {
      mediaLibrary.clearSelectedMedia(agent);
    } else if (args.selectedFilename) {
      mediaLibrary.selectMedia(args.selectedFilename, agent, args.selectedKind);
    } else if (args.selectedKind !== undefined) {
      mediaLibrary.setSelectedKind(args.selectedKind, agent);
    }

    const state = agent.getState(MediaLibraryState);
    return {
      status: "success",
      selectedFilename: state.selectedFilename ?? null,
      selectedKind: state.selectedKind ?? null,
    };
  },
});
