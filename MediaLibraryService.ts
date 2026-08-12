import fs from "node:fs/promises";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentCreationContext } from "@tokenring-ai/agent/types";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import { generateHumanId } from "@tokenring-ai/utility/string/generateHumanId";
import { exiftool } from "exiftool-vendored";
import { type MediaKind, type MediaLibraryEntry, MediaLibraryEntrySchema, MediaLibraryServiceConfigSchema, type ParsedMediaLibraryConfig } from "./schema.ts";
import { MediaLibraryState } from "./state/MediaLibraryState.ts";

type WriteMediaOptions = {
  kind: MediaKind;
  buffer: Buffer;
  mimeType: string;
  extension?: string | undefined;
  filename?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  duration?: number | undefined;
  sampleRate?: number | undefined;
  channels?: number | undefined;
  keywords?: string[] | undefined;
  prompt?: string | undefined;
};

/** Options for listing/filtering index entries. */
type DirectoryQueryOptions = {
  kind?: MediaKind | undefined;
  limit?: number | undefined;
  search?: string | undefined;
};

/** Options for similarity-based `search()`. Does not include text `search` filtering. */
type SearchOptions = {
  kind?: MediaKind | undefined;
  limit?: number | undefined;
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v", "mpeg", "mpg"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac"];

function extensionFromMimeType(mimeType: string, fallback = "bin"): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0];
  if (!subtype) return fallback;
  return subtype === "jpeg" ? "jpg" : subtype;
}

function kindFromFile(file: string, mimeType?: string): MediaKind | null {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";

  const ext = file.split(".").pop()?.toLowerCase();
  if (ext && IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext && VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (ext && AUDIO_EXTENSIONS.includes(ext)) return "audio";
  return null;
}

function defaultMimeTypeForKind(kind: MediaKind): string {
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/mpeg";
  return "image/jpeg";
}

function normalizeKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1.0;

  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const shorter = Math.min(aLower.length, bLower.length);
    const longer = Math.max(aLower.length, bLower.length);
    // Prefer longer relative matches (e.g. almost-full substring over single-char).
    return 0.5 + 0.3 * (shorter / longer);
  }

  const aWords = aLower.split(/\s+/).filter(Boolean);
  const bWords = bLower.split(/\s+/).filter(Boolean);
  if (aWords.length === 0 || bWords.length === 0) return 0;
  const matches = aWords.filter(w => bWords.includes(w)).length;
  return matches / Math.max(aWords.length, bWords.length);
}

/** Convert exiftool date fields (ExifDateTime, ISO-ish strings, or Date) to ISO-8601. */
function metadataDateToIso(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === "string") {
    // Exiftool often uses "YYYY:MM:DD HH:MM:SS" which Date cannot parse directly.
    const normalized = /^\d{4}:\d{2}:\d{2}/.test(value) ? value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3") : value;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return undefined;
  }

  if (typeof value === "object") {
    const obj = value as { toISOString?: () => string | undefined | null; toDate?: () => Date };
    if (typeof obj.toISOString === "function") {
      const iso = obj.toISOString();
      if (typeof iso === "string" && iso.length > 0) return iso;
    }
    if (typeof obj.toDate === "function") {
      const date = obj.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  return undefined;
}

function createdAtFromMetadata(metadata: { DateTimeOriginal?: unknown; CreateDate?: unknown; FileCreateDate?: unknown; FileModifyDate?: unknown }): string {
  for (const key of ["DateTimeOriginal", "CreateDate", "FileCreateDate", "FileModifyDate"] as const) {
    const iso = metadataDateToIso(metadata[key]);
    if (iso) return iso;
  }
  return new Date().toISOString();
}

export default class MediaLibraryService implements TokenRingService {
  readonly name = "MediaLibraryService";
  description = "Shared media library storage, indexing, search, and static serving";

  private options = MediaLibraryServiceConfigSchema.parse({});

  constructor(
    private app: TokenRingApp,
    options?: ParsedMediaLibraryConfig,
  ) {
    if (options) this.options = options;
  }

  reconfigure(options: ParsedMediaLibraryConfig): void {
    this.options = options;
  }

  /** Agent types configured for media library work (from MediaLibraryServiceConfigSchema.agentTypes). */
  getAgentTypes(): string[] {
    return [...this.options.agentTypes];
  }

  async stop(): Promise<void> {
    await exiftool.end();
  }

  attach(agent: Agent, creationContext: AgentCreationContext): void {
    agent.initializeState(MediaLibraryState, {});
    creationContext.items.push(`Media Library Directory: ${this.getOutputDirectoryName()}`);
  }

  /** Configured directory name relative to the workspace (e.g. `media-library`). */
  getOutputDirectoryName(): string {
    return this.options.outputDirectory;
  }

  /** Absolute path to the media library directory under the workspace. */
  getOutputDirectory(): string {
    return this.app.getWorkspaceResolvedPath(this.options.outputDirectory);
  }

  /**
   * Path to the media library relative to the working directory.
   * Used for FileSystemService ops and `/api/fs/{provider}/...` URLs (posix is rooted at the working directory).
   * Typically `.tokenring/media-library` when workspaceDirectory is `<working>/.tokenring`.
   */
  getServeDirectory(): string {
    const absolute = this.getOutputDirectory();
    const relative = path.relative(this.app.appConfig.workingDirectory, absolute);
    if (!relative || relative === ".") {
      throw new Error(`Media library directory resolves to the working directory root; set mediaLibrary.outputDirectory to a subdirectory`);
    }
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `Media library directory "${absolute}" is outside the working directory "${this.app.appConfig.workingDirectory}" and cannot be served via /api/fs`,
      );
    }
    // Normalize to posix separators for FileSystemService + HTTP URLs.
    return relative.split(path.sep).join("/");
  }

  /** @deprecated Use {@link getOutputDirectory} — directory is no longer agent-scoped. */
  getDefaultOutputDirectory(): string {
    return this.getOutputDirectory();
  }

  getSelectedMedia(agent: Agent): { filename: string; kind?: MediaKind } | null {
    const state = agent.getState(MediaLibraryState);
    if (!state.selectedFilename) return null;
    return {
      filename: state.selectedFilename,
      ...(state.selectedKind !== undefined && { kind: state.selectedKind }),
    };
  }

  selectMedia(filename: string, agent: Agent, kind?: MediaKind): void {
    agent.mutateState(MediaLibraryState, state => {
      state.selectedFilename = filename;
      state.selectedKind = kind;
    });
  }

  setSelectedKind(kind: MediaKind, agent: Agent): void {
    agent.mutateState(MediaLibraryState, state => {
      state.selectedKind = kind;
    });
  }

  clearSelectedMedia(agent: Agent): void {
    agent.mutateState(MediaLibraryState, state => {
      state.selectedFilename = undefined;
      state.selectedKind = undefined;
    });
  }

  getIndexPath(directory: string): string {
    return `${directory}/media_index.json`;
  }

  async writeMedia(options: WriteMediaOptions, agent: Agent): Promise<MediaLibraryEntry & { filePath: string; buffer: Buffer }> {
    const fileSystem = agent.requireService(FileSystemService);
    // FileSystemService + /api/fs are rooted at the working directory; absolute path is for exiftool/tools.
    const serveDir = this.getServeDirectory();
    const absoluteDir = this.getOutputDirectory();
    const extension = options.extension ?? extensionFromMimeType(options.mimeType);
    const filename = options.filename ?? `${generateHumanId()}.${extension}`;
    const relativePath = `${serveDir}/${filename}`;
    const absolutePath = path.join(absoluteDir, filename);

    await fileSystem.writeFile(relativePath, options.buffer, agent);

    const entry: MediaLibraryEntry = {
      kind: options.kind,
      filename,
      mimeType: options.mimeType,
      ...(options.width !== undefined && { width: options.width }),
      ...(options.height !== undefined && { height: options.height }),
      ...(options.duration !== undefined && { duration: options.duration }),
      ...(options.sampleRate !== undefined && { sampleRate: options.sampleRate }),
      ...(options.channels !== undefined && { channels: options.channels }),
      keywords: options.keywords ?? [],
      ...(options.prompt && { prompt: options.prompt }),
      createdAt: new Date().toISOString(),
    };

    await this.addToIndex(entry, agent);
    return { ...entry, filePath: absolutePath, buffer: options.buffer };
  }

  async addToIndex(entry: MediaLibraryEntry, agent: Agent): Promise<void> {
    const fileSystem = agent.requireService(FileSystemService);
    await fileSystem.appendFile(this.getIndexPath(this.getServeDirectory()), JSON.stringify(MediaLibraryEntrySchema.parse(entry)) + "\n", agent);
  }

  /**
   * Read media index entries from a directory.
   * When `agent` is provided, uses FileSystemService (sandbox/path resolution).
   * Without agent (e.g. RPC), falls back to Node fs for the workspace path.
   */
  async getEntriesFromDirectory(directory: string, options: DirectoryQueryOptions = {}, agent?: Agent): Promise<MediaLibraryEntry[]> {
    const entries: MediaLibraryEntry[] = [];
    const indexPath = this.getIndexPath(directory);

    let content: string | null;
    if (agent) {
      const fileSystem = agent.requireService(FileSystemService);
      content = await fileSystem.readTextFile(indexPath, agent);
    } else {
      try {
        content = await fs.readFile(indexPath, "utf-8");
      } catch {
        content = null;
      }
    }

    if (content) {
      const lines = content.trim().split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line?.trim()) continue;
        try {
          const parsed = JSON.parse(line) as unknown;
          const entry = MediaLibraryEntrySchema.parse(parsed);
          entries.push(entry);
        } catch (error: unknown) {
          const message = `Skipping malformed media index entry in ${indexPath} (line ${i + 1})`;
          if (agent) {
            agent.warningMessage(message, error as Error);
          } else {
            console.warn(message, error);
          }
        }
      }
    }

    let filtered = entries;
    if (options.kind) {
      filtered = filtered.filter(entry => entry.kind === options.kind);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter(
        entry =>
          entry.filename.toLowerCase().includes(q) ||
          entry.prompt?.toLowerCase().includes(q) ||
          entry.keywords.some(keyword => keyword.toLowerCase().includes(q)),
      );
    }
    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }
    return filtered.reverse();
  }

  async search(query: string, options: SearchOptions, agent: Agent): Promise<Array<MediaLibraryEntry & { score: number; path: string }>> {
    const absoluteDir = this.getOutputDirectory();
    // Prefer the working-directory-relative serve path when an agent is available so
    // FileSystemService can resolve under the agent root; otherwise use the absolute
    // workspace path for Node-fs reads (e.g. RPC).
    const entries = await this.getEntriesFromDirectory(this.getServeDirectory(), { kind: options.kind }, agent);
    const results: Array<MediaLibraryEntry & { score: number; path: string }> = [];

    for (const entry of entries) {
      const searchable = [entry.filename, entry.prompt, ...entry.keywords].filter(Boolean).join(" ");
      const score = similarity(query, searchable);
      if (score > 0) {
        results.push({ ...entry, score, path: path.join(absoluteDir, entry.filename) });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.limit ?? 10);
  }

  async reindex(agent: Agent, kinds: MediaKind[] = ["image", "video", "audio"]): Promise<number> {
    const serveDir = this.getServeDirectory();
    const absoluteDir = this.getOutputDirectory();
    const fileSystem = agent.requireService(FileSystemService);
    const extensions = [
      ...(kinds.includes("image") ? IMAGE_EXTENSIONS : []),
      ...(kinds.includes("video") ? VIDEO_EXTENSIONS : []),
      ...(kinds.includes("audio") ? AUDIO_EXTENSIONS : []),
    ];

    agent.infoMessage(`Reindexing media in ${serveDir} (${absoluteDir})...`);

    // Preserve entries for kinds not included in this reindex pass (avoids wiping other media).
    const existingEntries = await this.getEntriesFromDirectory(serveDir, {}, agent);
    const preserved = existingEntries.filter(entry => !kinds.includes(entry.kind));

    // Glob via FileSystemService using the working-directory-relative serve path.
    const files = extensions.length > 0 ? await fileSystem.glob(`${serveDir}/*.{${extensions.join(",")}}`, { ignoreFilter: () => false }, agent) : [];
    const scanned: MediaLibraryEntry[] = [];

    for (const file of files) {
      const filename = path.basename(file);
      const detectedKind = kindFromFile(file);
      // Glob returns working-directory-relative paths; exiftool needs a real filesystem path.
      const absoluteFile = path.isAbsolute(file) ? file : this.app.getWorkingDirectoryResolvedPath(file);

      try {
        const metadata = await exiftool.read(absoluteFile);
        const mimeType = metadata.MIMEType || (detectedKind === "video" ? "video/mp4" : detectedKind === "audio" ? "audio/mpeg" : "image/jpeg");
        const kind = kindFromFile(file, mimeType);
        if (!kind || !kinds.includes(kind)) continue;

        const entry = MediaLibraryEntrySchema.parse({
          kind,
          filename,
          mimeType,
          width: metadata.ImageWidth,
          height: metadata.ImageHeight,
          duration: typeof metadata.Duration === "number" ? metadata.Duration : undefined,
          sampleRate: typeof metadata.AudioSampleRate === "number" ? metadata.AudioSampleRate : undefined,
          channels: typeof metadata.AudioChannels === "number" ? metadata.AudioChannels : undefined,
          keywords: normalizeKeywords(metadata.Keywords),
          prompt: typeof metadata.ImageDescription === "string" ? metadata.ImageDescription : undefined,
          createdAt: createdAtFromMetadata(metadata),
        });
        scanned.push(entry);
      } catch (error: unknown) {
        agent.warningMessage(`Failed to read metadata for ${file}`, error as Error);
        // Keep a minimal discoverable entry so reindex does not drop the file from the library.
        if (detectedKind && kinds.includes(detectedKind)) {
          const entry = MediaLibraryEntrySchema.parse({
            kind: detectedKind,
            filename,
            mimeType: defaultMimeTypeForKind(detectedKind),
            keywords: [],
            createdAt: new Date().toISOString(),
          });
          scanned.push(entry);
        }
      }
    }

    const allEntries = [...preserved, ...scanned];
    const indexBody = allEntries.map(entry => JSON.stringify(entry)).join("\n") + (allEntries.length ? "\n" : "");

    await fileSystem.writeFile(this.getIndexPath(serveDir), indexBody, agent);
    agent.infoMessage(`Reindexed ${scanned.length} media files (${allEntries.length} total in index).`);
    return scanned.length;
  }
}
