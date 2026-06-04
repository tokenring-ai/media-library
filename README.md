# @tokenring-ai/media-library

Shared media storage, indexing, search, and static serving for TokenRing media packages.

## Overview

This package provides a common media library for images, videos, and audio. Generation and editing packages use it for
file naming, output directory management, metadata indexing, search, and static web serving.

Media entries are stored as newline-delimited JSON in `media_index.json` inside the configured media directory. The
library also reads the legacy `image_index.json` file when listing existing image entries, so older generated image
libraries remain visible.

## Key Features

- **Shared Media Storage**: One configured directory for images, videos, and audio
- **Automatic Indexing**: Writes metadata entries for generated or imported media
- **Reindexing**: Scans existing files and rebuilds `media_index.json`
- **Media Search**: Search filenames, prompts, and keywords with similarity scoring
- **Static Serving**: Serves media files through `@tokenring-ai/web-host`
- **Agent State**: Per-agent media directory overrides through `MediaLibraryState`
- **Metadata Support**: Stores dimensions, duration, sample rate, channels, keywords, prompts, MIME type, and timestamps
- **Legacy Compatibility**: Reads existing `image_index.json` entries alongside the new media index

## Installation

```bash
bun add @tokenring-ai/media-library
```

## Plugin Configuration

Configure the media library plugin in your application config:

```yaml
mediaLibrary:
  staticPath: /api/media
  agentDefaults:
    outputDirectory: ./.tokenring/media-library
```

### Configuration Schema

```typescript
import { MediaLibraryServiceConfigSchema } from "@tokenring-ai/media-library";

MediaLibraryServiceConfigSchema = z.object({
  staticPath: z.string().default("/api/media"),
  agentDefaults: z.object({
    outputDirectory: z.string(),
  }),
});
```

**Configuration Options:**

| Field                            | Type     | Required | Description                                      |
|----------------------------------|----------|----------|--------------------------------------------------|
| `staticPath`                     | `string` | No       | Web path used to serve media. Default: `/api/media` |
| `agentDefaults.outputDirectory`  | `string` | Yes      | Directory where media files and indexes are stored |

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

const mediaLibrary = agent.requireServiceByType(MediaLibraryService);
```

### Methods

| Method | Description |
|--------|-------------|
| `getStaticPath()` | Return the configured static web path |
| `getDefaultOutputDirectory()` | Return the application default media directory |
| `getOutputDirectory(agent)` | Return the active agent media directory |
| `writeMedia(options, agent)` | Write a media buffer, add it to the index, and return file details |
| `addToIndex(entry, agent)` | Append an existing media entry to `media_index.json` |
| `getEntriesFromDirectory(directory, options)` | Read indexed entries from a directory |
| `search(query, options, agent)` | Search indexed media entries |
| `reindex(agent, kinds?)` | Rebuild the media index by scanning files |

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

## Web Host Integration

The plugin registers a static web resource with `@tokenring-ai/web-host`:

```text
/api/media/<filename>
```

The path can be changed with `mediaLibrary.staticPath`.

## Related Packages

- `@tokenring-ai/image` - Generates and edits images stored in the media library
- `@tokenring-ai/video` - Generates videos stored in the media library
- `@tokenring-ai/audio` - Records audio and stores generated speech in the media library
