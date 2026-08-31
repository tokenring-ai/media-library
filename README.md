# @tokenring-ai/media-library

Shared media storage, indexing, search, and static serving for TokenRing media packages.

## Overview

This package provides a common media library for images, videos, and audio. Generation and editing packages use it for
file naming, output directory management, metadata indexing, search, and static web serving.

Media entries are stored as newline-delimited JSON in `media_index.json` inside the configured media directory.

### Key Features

- **Shared Media Storage**: One workspace/plugin-level directory for images, videos, and audio
- **Automatic Indexing**: Writes metadata entries for generated or imported media
- **Reindexing**: Scans existing files and rebuilds `media_index.json`
- **Media Search**: Search filenames, prompts, and keywords with similarity scoring
- **Static Serving**: Computes working-directory-relative paths for serving media files through `@tokenring-ai/filesystem` over HTTP
- **Agent State**: Per-agent selection tracking through `MediaLibraryState`
- **Metadata Support**: Stores dimensions, duration, sample rate, channels, keywords, prompts, MIME type, and timestamps

### Integration Points

- `@tokenring-ai/image` — Generates and edits images stored in the media library
- `@tokenring-ai/video` — Generates videos stored in the media library
- `@tokenring-ai/audio` — Records audio and stores generated speech in the media library
- `@tokenring-ai/filesystem` — Serves media files over HTTP via the filesystem plugin's `/api/fs/{provider}/...` route

Media files are served by the filesystem plugin over HTTP (not by this package directly):

```text
/api/fs/{provider}/{outputDirectory}/<filename>
```

Example with defaults (`posix` provider, `media-library` directory):

```text
/api/fs/posix/media-library/panda.png
```

## Installation

```bash
bun add @tokenring-ai/media-library
```

## Chat Commands

| Command | Description |
|---------|-------------|
| `/media reindex` | Reindex the media library directory |

### /media reindex

Regenerate `media_index.json` by scanning images, videos, and audio files in the media library directory.

**Usage:**

```bash
/media reindex
```

**Behavior:**

1. Scans the media directory for supported media files
2. Reads file metadata with `exiftool-vendored`
3. Rebuilds `media_index.json`, preserving entries for media kinds not included in the scan
4. Returns `Media library re-indexed successfully. <count> files indexed.`

**Supported Extensions:**

| Kind  | Extensions |
|-------|------------|
| Image | `jpg`, `jpeg`, `png`, `webp` |
| Video | `mp4`, `mov`, `webm`, `m4v`, `mpeg`, `mpg` |
| Audio | `mp3`, `wav`, `m4a`, `ogg`, `oga`, `flac`, `aac` |

## Tools

| Tool | Display Name | Description |
|------|--------------|-------------|
| `media_search` | Media Library/search | Search for media library entries by filename, prompt, or keywords |

### media_search

Search the media library by filename, prompt, or keywords.

**Description:** Search for media library entries by filename, prompt, or keywords

**Schema strictness:** The input schema uses `z.object({ ... })` without `.strict()`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | Search query to match against media metadata |
| `kind` | `"image" \| "video" \| "audio"` | No | Optional media kind filter |
| `limit` | `number` | No | Maximum results to return. Default: `10` |

**Usage Example:**

```typescript
const result = await agent.useTool("media_search", {
  query: "product demo",
  kind: "video",
  limit: 5,
});
```

## Configuration

Configure the media library plugin in your application config:

```yaml
mediaLibrary:
  outputDirectory: media-library
  agentTypes:
    - media
    - image
    - imageGeneration
    - video
    - videoGeneration
    - audio
    - voice
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `outputDirectory` | `string` | No | `media-library` | Directory for media files and indexes, relative to the workspace |
| `agentTypes` | `string[]` | No | `["media", "image", "imageGeneration", "video", "videoGeneration", "audio", "voice"]` | The available agent types that can be used for media library work |

### Schema Metadata

| Field | Meta Key | Value |
|-------|----------|-------|
| Root | `label` | `Media Library` |
| Root | `description` | `Storage for agent-generated images, video, and audio` |
| `outputDirectory` | `description` | `Directory for media files and indexes, relative to the workspace (default: media-library)` |
| `agentTypes` | `description` | `The available agent types that can be used for media library work` |

### Agent Types

The plugin ships an agent type via `config/agents/media.yaml`:

| Property | Value |
|----------|-------|
| Display Name | Media Agent |
| Category | Media |
| Description | An agent that searches, generates, and works with media library images, video, and audio |
| Enabled Tools | `media_*`, `image_*`, `video_*`, `audio_*`, `todo`, `file_*` |
| Enabled Hooks | `addSelectedMedia` |

The `agentTypes` config field references agent types available for media library work in the UI; the `media` agent type defined here provides a system prompt and tool/hook configuration for media-oriented agents.

## Core Components

### MediaLibraryService

The service manages media directory state, index writes, index reads, search, and reindexing.

```typescript
import { MediaLibraryService } from "@tokenring-ai/media-library";

const mediaLibrary = agent.requireService(MediaLibraryService);
```

#### MediaLibraryService Methods

| Method | Description |
|--------|-------------|
| `reconfigure(options: ParsedMediaLibraryConfig): void` | Update service configuration at runtime |
| `getAgentTypes(): string[]` | Return the configured agent types for media library work |
| `stop(): Promise<void>` | End the exiftool process (plugin teardown) |
| `attach(agent: Agent, creationContext: AgentCreationContext): void` | Initialize `MediaLibraryState` on an agent and push the media directory to the creation context items |
| `getOutputDirectoryName(): string` | Return the configured directory name relative to the workspace (e.g. `media-library`) |
| `getOutputDirectory(): string` | Return the absolute path to the media library directory under the workspace |
| `getServeDirectory(): string` | Return the path to the media library relative to the working directory, for FileSystemService ops and `/api/fs/{provider}/...` URLs |
| `getDefaultOutputDirectory(): string` | Deprecated — alias for `getOutputDirectory()` |
| `getSelectedMedia(agent: Agent): { filename: string; kind?: MediaKind } \| null` | Return the currently selected media for an agent, or `null` |
| `selectMedia(filename: string, agent: Agent, kind?: MediaKind): void` | Set the selected media filename and optional kind for an agent |
| `setSelectedKind(kind: MediaKind, agent: Agent): void` | Update the selected media kind for an agent |
| `clearSelectedMedia(agent: Agent): void` | Clear the selected media for an agent |
| `getIndexPath(directory: string): string` | Return the path to `media_index.json` within a directory |
| `writeMedia(options: WriteMediaOptions, agent: Agent): Promise<MediaLibraryEntry & { filePath: string; buffer: Buffer }>` | Write a media buffer, add it to the index, and return file details |
| `addToIndex(entry: MediaLibraryEntry, agent: Agent): Promise<void>` | Append an existing media entry to `media_index.json` |
| `getEntriesFromDirectory(directory: string, options?: DirectoryQueryOptions, agent?: Agent): Promise<MediaLibraryEntry[]>` | Read indexed entries from a directory, with optional filtering by kind, search text, and limit |
| `search(query: string, options: SearchOptions, agent: Agent): Promise<Array<MediaLibraryEntry & { score: number; path: string }>>` | Search indexed media entries with similarity scoring |
| `reindex(agent: Agent, kinds?: MediaKind[]): Promise<number>` | Rebuild the media index by scanning files; returns the number of scanned files |

#### WriteMediaOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | `MediaKind` | Yes | Media kind (`image`, `video`, or `audio`) |
| `buffer` | `Buffer` | Yes | File content to write |
| `mimeType` | `string` | Yes | MIME type of the media |
| `extension` | `string` | No | File extension (inferred from MIME type if omitted) |
| `filename` | `string` | No | Filename (generated via `generateHumanId()` if omitted) |
| `width` | `number` | No | Image or video width in pixels |
| `height` | `number` | No | Image or video height in pixels |
| `duration` | `number` | No | Duration in seconds (video or audio) |
| `sampleRate` | `number` | No | Audio sample rate |
| `channels` | `number` | No | Audio channel count |
| `keywords` | `string[]` | No | Keyword tags for the media entry |
| `prompt` | `string` | No | Generation prompt associated with the media |

#### DirectoryQueryOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | `MediaKind` | No | Filter entries by media kind |
| `limit` | `number` | No | Maximum number of entries to return |
| `search` | `string` | No | Case-insensitive text filter on filename, prompt, and keywords |

#### SearchOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | `MediaKind` | No | Filter entries by media kind |
| `limit` | `number` | No | Maximum number of results to return. Default: `10` |

#### writeMedia Example

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

### MediaLibraryState

Per-agent state slice tracking the currently selected media library item.

#### MediaLibraryState Properties

| Property | Type | Description |
|----------|------|-------------|
| `selectedFilename` | `string \| undefined` | Filename of the currently selected media item |
| `selectedKind` | `MediaKind \| undefined` | Kind of the currently selected media item |
| `lastAttachedFilename` | `string \| undefined` | Filename of the last media item attached to a chat message (prevents duplicate attachments) |

#### MediaLibraryState Methods

| Method | Description |
|--------|-------------|
| `transferStateFromParent(parent: Agent): void` | Inherit `selectedFilename` and `selectedKind` from a parent agent's state if unset |
| `serialize(): z.output<typeof serializationSchema>` | Serialize state for persistence |
| `deserialize(data): void` | Restore state from serialized data |
| `show(): string` | Return a human-readable summary of the current selection |

### Media Index Entry

The on-disk index format. Each line in `media_index.json` is a JSON object matching `MediaLibraryEntry`:

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

## Services

The plugin is installed via `PluginManager.installPlugins`:

```typescript
import TokenRingApp from "@tokenring-ai/app";
import PluginManager from "@tokenring-ai/app/PluginManager";
import mediaLibraryPlugin from "@tokenring-ai/media-library/plugin";

const app = new TokenRingApp({ app: { workingDirectory, workspaceDirectory, configDirectories } });
const pluginManager = app.addService(new PluginManager(app));
await pluginManager.installPlugins([mediaLibraryPlugin]);
```

### Plugin Lifecycle

| Property | Value |
|----------|-------|
| Name | `@tokenring-ai/media-library` |
| Display Name | Media Library |
| Version | `0.2.0` |
| Description | Shared media library storage, indexing, and search for TokenRing media packages. |
| Config Schema | `z.object({ mediaLibrary: MediaLibraryServiceConfigSchema })` |

**install:**

1. `app.addService(new MediaLibraryService(app))` — registers the media library service
2. `waitForService(AgentLifecycleService)` → `lifecycleService.addHooks(addSelectedMedia)`
3. `waitForService(ChatService)` → `chatService.addTools(tools)`
4. `waitForService(AgentCommandService)` → `agentCommandService.addAgentCommands(agentCommands)`
5. `waitForService(RpcService)` → `rpcService.registerEndpoint(mediaLibraryRPC)`

**reconfigure:**

Calls `app.requireService(MediaLibraryService).reconfigure(config.mediaLibrary)` to update the output directory and agent types at runtime.

### Lifecycle Hooks

| Hook | Display Name | Description | Trigger |
|------|--------------|-------------|---------|
| `addSelectedMedia` | Media Library/Tag currently selected media in chat | Tags the currently selected media library item by filename only (does not attach the media file) | `BeforeInputReceived` |

When an agent has a selected media item (`selectedFilename` is set and differs from `lastAttachedFilename`), the hook pushes a text attachment into `data.input.attachments`:

```typescript
attachments.push({
  name: state.selectedFilename,
  description: `The currently selected ${kindLabel}media library item (filename only; the media file itself is not attached).`,
  encoding: "text",
  mimeType: "text/plain",
  body: state.selectedFilename,
});
```

The hook only attaches once per selection — `lastAttachedFilename` is updated to prevent duplicate attachments on subsequent messages.

## RPC

The plugin registers an RPC endpoint at `/rpc/media-library` with five methods.

| Method | Type | Description |
|--------|------|-------------|
| `getMediaLibraryConfiguration` | query | Return agent types, output directory name, and serve directory path |
| `getMedia` | query | List media index entries with optional kind filter, text search, and limit |
| `streamMedia` | stream | Polling stream of media index entries (10 second interval) with optional kind filter, text search, and limit |
| `getMediaLibraryState` | query | Return the selected media state for a given agent |
| `updateMediaLibraryState` | mutation | Update the selected media state for a given agent |

### getMedia / streamMedia Input

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `search` | `string` | No | — | Case-insensitive text filter on filename, prompt, and keywords |
| `limit` | `number` | No | `200` | Maximum number of entries to return |
| `kind` | `MediaKind[]` | No | — | When provided, only entries whose kind is in the list are returned |

### getMedia / streamMedia Result

| Field | Type | Description |
|-------|------|-------------|
| `media` | `MediaIndexEntry[]` | Array of media index entries (discriminated union on `kind`) |
| `count` | `number` | Total number of matching entries before limit is applied |

### getMediaLibraryState / updateMediaLibraryState Result

Discriminated union on `status`:

| Status | Additional Fields | Description |
|--------|-------------------|-------------|
| `success` | `selectedFilename: string \| null`, `selectedKind: MediaKind \| null` | Agent found; returns current selection state |
| `agentNotFound` | — | No agent with the given `agentId` |

### updateMediaLibraryState Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | `string` | Yes | ID of the agent whose state to update |
| `selectedFilename` | `string` | No | Filename to select |
| `selectedKind` | `MediaKind` | No | Kind to set for the selection |
| `clearSelection` | `boolean` | No | When `true`, clears the current selection |

When `clearSelection` is `true`, the selection is cleared. Otherwise, if `selectedFilename` is provided, `selectMedia` is called. If only `selectedKind` is provided, `setSelectedKind` is called.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@tokenring-ai/agent` | Agent types, `AgentCommandService`, `AgentStateSlice` |
| `@tokenring-ai/app` | `TokenRingApp`, `TokenRingPlugin`, `TokenRingService` types, config metadata |
| `@tokenring-ai/chat` | `ChatService`, `TokenRingToolDefinition`, `TokenRingToolResult` |
| `@tokenring-ai/filesystem` | `FileSystemService` for file I/O and static serving |
| `@tokenring-ai/lifecycle` | `AgentLifecycleService`, `HookSubscription`, `HookCallback` |
| `@tokenring-ai/rpc` | `RpcService`, `RPCSchema`, `createRPCEndpoint`, `createPollingQueryStream` |
| `@tokenring-ai/utility` | `generateHumanId`, `markdownTable` |
| `exiftool-vendored` | Metadata extraction for reindexing |
| `zod` | Schema validation |

## Testing

```bash
bun test
```

This package does not currently ship any `*.test.ts` files. The test commands are defined in `package.json` for future coverage.

## License

MIT License — see LICENSE file for details.
