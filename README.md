# @tokenring-ai/media-library

Shared media storage, indexing, search, and static serving for TokenRing media packages.

## Overview

This package provides a common media library for images, videos, and audio. Generation and editing packages use it for
file naming, output directory management, metadata indexing, search, and static web serving.

Media entries are stored as newline-delimited JSON in `media_index.json` inside the configured media directory.

## Key Features

- **Shared Media Storage**: One workspace/plugin-level directory for images, videos, and audio
- **Automatic Indexing**: Writes metadata entries for generated or imported media
- **Reindexing**: Scans existing files and rebuilds `media_index.json`
- **Media Search**: Search filenames, prompts, and keywords with similarity scoring
- **Static Serving**: Serves media files through `@tokenring-ai/web-host`
- **Agent State**: Per-agent selection tracking through `MediaLibraryState`
- **Metadata Support**: Stores dimensions, duration, sample rate, channels, keywords, prompts, MIME type, and timestamps

## Installation

```bash
bun add @tokenring-ai/media-library
```

## Plugin Configuration

Configure the media library plugin in your application config:

```yaml
mediaLibrary:
  outputDirectory: media-library
```

### Configuration Schema

```typescript
import { MediaLibraryServiceConfigSchema } from "@tokenring-ai/media-library";

MediaLibraryServiceConfigSchema = z.object({
  outputDirectory: z.string().default("media-library"),
  agentTypes: z.array(z.string()).default([
    "media", "image", "imageGeneration", "video", "videoGeneration", "audio", "voice",
  ]),
});
```

**Configuration Options:**

| Field             | Type       | Required | Description                                          |
|-------------------|------------|----------|------------------------------------------------------|
| `outputDirectory` | `string`   | No       | Workspace-level directory for media files and indexes. Default: `media-library` |
| `agentTypes`      | `string[]` | No       | Agent types offered for media library work in the UI. Default: `media`, `image`, `imageGeneration`, `video`, `videoGeneration`, `audio`, `voice` |

## Media Index

The media library writes entries to `media_index.json` as newline-delimited JSON.

```typescript
type MediaKind = "image" | "video" | "audio";

type MediaLibraryEntry = {
  kind: MediaKind;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  keywords: string[];
  prompt?: string;
  createdAt?: string;
};
```

## Chat Commands

### /media reindex

Regenerate `media_index.json` by scanning images, videos, and audio files in the media library directory.

**Usage:**

```bash
/media reindex
```

**Behavior:**

1. Scans the media directory for supported media files
2. Reads file metadata with `exiftool-vendored`
3. Rebuilds `media_index.json`
4. Preserves one metadata entry per discovered media file

**Supported Extensions:**

| Kind  | Extensions |
|-------|------------|
| Image | `jpg`, `jpeg`, `png`, `webp` |
| Video | `mp4`, `mov`, `webm`, `m4v`, `mpeg`, `mpg` |
| Audio | `mp3`, `wav`, `m4a`, `ogg`, `oga`, `flac`, `aac` |

## Tools

### media_search

Search the media library by filename, prompt, or keywords.

**Tool Definition:**

```typescript
import { TokenRingToolDefinition } from "@tokenring-ai/chat/schema";
import { z } from "zod";

const media_search: TokenRingToolDefinition = {
  name: "media_search",
  displayName: "Media Library/search",
  description: "Search for media library entries by filename, prompt, or keywords",
  inputSchema: z.object({
    query: z.string().describe("Search query to match against media metadata"),
    kind: z.enum(["image", "video", "audio"]).describe("Optional media kind filter").exactOptional(),
    limit: z.number().int().positive().default(10).describe("Maximum number of results to return").exactOptional(),
  }),
  execute: async (input, agent) => {
    // Implementation
  },
};
```

**Usage Example:**

```typescript
const result = await agent.useTool("media_search", {
  query: "product demo",
  kind: "video",
  limit: 5,
});
```

**Parameters:**

| Parameter | Type                             | Required | Description                                      |
|-----------|----------------------------------|----------|--------------------------------------------------|
| `query`   | `string`                         | Yes      | Search query to match against metadata           |
| `kind`    | `"image" \| "video" \| "audio"` | No       | Optional media type filter                       |
| `limit`   | `number`                         | No       | Maximum results to return. Default: 10           |

## Service API

### MediaLibraryService

The service manages media directory state, index writes, index reads, search, and reindexing.

```typescript
import { MediaLibraryService } from "@tokenring-ai/media-library";

const mediaLibrary = agent.requireService(MediaLibraryService);
```

### Methods

| Method | Description |
|--------|-------------|
| `getOutputDirectory()` | Return the workspace/plugin media directory |
| `writeMedia(options, agent)` | Write a media buffer, add it to the index, and return file details |
| `addToIndex(entry, agent)` | Append an existing media entry to `media_index.json` |
| `getEntriesFromDirectory(directory, options, agent?)` | Read indexed entries from a directory |
| `search(query, options, agent)` | Search indexed media entries |
| `reindex(agent, kinds?)` | Rebuild the media index by scanning files |
| `stop()` | End the exiftool process (plugin teardown) |

### writeMedia Example

```typescript
const media = await mediaLibrary.writeMedia(
  {
    kind: "audio",
    buffer: Buffer.from(audioBytes),
    mimeType: "audio/mpeg",
    extension: "mp3",
    prompt: "Welcome narration",
    keywords: ["narration", "welcome"],
  },
  agent,
);

console.log(media.filePath);
```

## HTTP Access

Media files are served by the filesystem plugin over HTTP (not by this package):

```text
/api/fs/{provider}/{outputDirectory}/<filename>
```

Example with defaults (`posix` provider, `media-library` directory):

```text
/api/fs/posix/media-library/panda.png
```

## Related Packages

- `@tokenring-ai/image` - Generates and edits images stored in the media library
- `@tokenring-ai/video` - Generates videos stored in the media library
- `@tokenring-ai/audio` - Records audio and stores generated speech in the media library
