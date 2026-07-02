import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import MediaLibraryService from "../MediaLibraryService.ts";
import MediaLibraryRpcSchema from "./schema.ts";

async function projectAudios(args: { search?: string; limit?: number }, app: TokenRingApp) {
  const mediaLibrary = app.requireService(MediaLibraryService);
  const audios = await mediaLibrary.getEntriesFromDirectory(mediaLibrary.getDefaultOutputDirectory(), {
    kind: "audio",
    search: args.search,
  });
  const limitedAudios = audios.slice(0, args.limit ?? 200);

  return {
    audios: limitedAudios.map(audio => ({
      kind: "audio" as const,
      filename: audio.filename,
      mimeType: audio.mimeType,
      keywords: audio.keywords,
      ...(audio.duration !== undefined && { duration: audio.duration }),
      ...(audio.sampleRate !== undefined && { sampleRate: audio.sampleRate }),
      ...(audio.channels !== undefined && { channels: audio.channels }),
      ...(audio.prompt !== undefined && { prompt: audio.prompt }),
      ...(audio.createdAt !== undefined && { createdAt: audio.createdAt }),
    })),
    count: audios.length,
  };
}

async function projectImages(args: { search?: string; limit?: number }, app: TokenRingApp) {
  const mediaLibrary = app.requireService(MediaLibraryService);
  const images = await mediaLibrary.getEntriesFromDirectory(mediaLibrary.getDefaultOutputDirectory(), {
    kind: "image",
    search: args.search,
  });
  const limitedImages = images.slice(0, args.limit ?? 200);

  return {
    images: limitedImages.map(image => ({
      kind: "image" as const,
      filename: image.filename,
      mimeType: image.mimeType,
      width: image.width ?? 0,
      height: image.height ?? 0,
      keywords: image.keywords,
    })),
    count: images.length,
  };
}

async function projectVideos(args: { search?: string; limit?: number }, app: TokenRingApp) {
  const mediaLibrary = app.requireService(MediaLibraryService);
  const videos = await mediaLibrary.getEntriesFromDirectory(mediaLibrary.getDefaultOutputDirectory(), {
    kind: "video",
    search: args.search,
  });
  const limitedVideos = videos.slice(0, args.limit ?? 200);

  return {
    videos: limitedVideos.map(video => ({
      kind: "video" as const,
      filename: video.filename,
      mimeType: video.mimeType,
      keywords: video.keywords,
      ...(video.width !== undefined && { width: video.width }),
      ...(video.height !== undefined && { height: video.height }),
      ...(video.duration !== undefined && { duration: video.duration }),
      ...(video.prompt !== undefined && { prompt: video.prompt }),
      ...(video.createdAt !== undefined && { createdAt: video.createdAt }),
    })),
    count: videos.length,
  };
}

const streamAudios = createPollingQueryStream({
  intervalMs: 10000,
  poll: projectAudios,
});

const streamImages = createPollingQueryStream({
  intervalMs: 10000,
  poll: projectImages,
});

const streamVideos = createPollingQueryStream({
  intervalMs: 10000,
  poll: projectVideos,
});

export default createRPCEndpoint(MediaLibraryRpcSchema, {
  async getAudios(args, app: TokenRingApp) {
    return projectAudios(args, app);
  },

  streamAudios,

  async getImages(args, app: TokenRingApp) {
    return projectImages(args, app);
  },

  streamImages,

  async getVideos(args, app: TokenRingApp) {
    return projectVideos(args, app);
  },

  streamVideos,
});