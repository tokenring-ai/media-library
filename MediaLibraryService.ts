import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { AgentManager } from "@tokenring-ai/agent";
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

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic"];
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

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
};

function defaultMimeTypeForKind(kind: MediaKind): string {
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/mpeg";
  return "image/jpeg";
}

function mimeTypeForFile(filename: string, kind: MediaKind): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && MIME_TYPES_BY_EXTENSION[ext]) ?? defaultMimeTypeForKind(kind);
}

function extensionsForKinds(kinds: readonly MediaKind[]): string[] {
  return [
    ...(kinds.includes("image") ? IMAGE_EXTENSIONS : []),
    ...(kinds.includes("video") ? VIDEO_EXTENSIONS : []),
    ...(kinds.includes("audio") ? AUDIO_EXTENSIONS : []),
  ];
}

const INDEX_FILENAME = "media_index.json";

/**
 * Validates a media file name supplied by a caller (RPC, upload): a bare file
 * name inside the library directory with a recognised media extension.
 * Returns the media kind the extension implies.
 */
export function validateMediaFilename(filename: string): MediaKind {
  if (!filename.trim()) throw new Error("File name is required");
  if (filename.trim() !== filename) throw new Error("File name cannot start or end with whitespace");
  if (filename.includes("/") || filename.includes("\\") || filename.includes("\0")) throw new Error("File name cannot contain path separators");
  if (filename.startsWith(".")) throw new Error("File name cannot start with a dot");
  if (filename === INDEX_FILENAME) throw new Error(`${INDEX_FILENAME} is reserved for the library index`);
  const kind = kindFromFile(filename);
  if (!kind) throw new Error(`"${filename}" does not have a supported image, video or audio extension`);
  return kind;
}

/** Outcome of a merge reindex. */
export type ReindexSummary = {
  /** Entries in the index after the reindex (all kinds). */
  total: number;
  /** Files found on disk that were not indexed yet. */
  added: number;
  /** Index entries whose file no longer exists. */
  removed: number;
  /** Index entries kept as-is because their file still exists. */
  kept: number;
};

/**
 * File access for the library directory. With an agent every operation goes
 * through FileSystemService (allow-list, sandbox, archiving); without one
 * (RPC) it works directly on the workspace media directory.
 */
type MediaStorage = {
  readIndex(): Promise<string | null>;
  writeIndex(body: string): Promise<void>;
  appendIndex(line: string): Promise<void>;
  /** Bare file names in the library directory whose extension is in `extensions`. */
  listFiles(extensions: readonly string[]): Promise<string[]>;
  exists(filename: string): Promise<boolean>;
  modifiedAt(filename: string): Promise<string | undefined>;
  writeFile(filename: string, buffer: Buffer): Promise<void>;
  deleteFile(filename: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
};

/** Collapses duplicate index lines for one file: the newest metadata wins, the first position is kept. */
function dedupeEntries(entries: readonly MediaLibraryEntry[]): MediaLibraryEntry[] {
  const byFilename = new Map<string, MediaLibraryEntry>();
  for (const entry of entries) byFilename.set(entry.filename, entry);
  return [...byFilename.values()];
}

function serializeIndex(entries: readonly MediaLibraryEntry[]): string {
  return entries.map(entry => JSON.stringify(MediaLibraryEntrySchema.parse(entry))).join("\n") + (entries.length ? "\n" : "");
}

function normalizeKeywordList(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (!keyword || seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    result.push(keyword);
  }
  return result;
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
   * Path to the media library relative to the WORKSPACE directory.
   * FileSystemService and `/api/fs/...` resolve relative paths
   * against the workspace directory. Typically `media-library`.
   */
  getServeDirectory(): string {
    const absolute = this.getOutputDirectory();
    const relative = path.relative(this.app.appConfig.workspaceDirectory, absolute);
    if (!relative || relative === ".") {
      throw new Error(`Media library directory resolves to the workspace directory root; set mediaLibrary.outputDirectory to a subdirectory`);
    }
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `Media library directory "${absolute}" is outside the workspace directory "${this.app.appConfig.workspaceDirectory}" and cannot be served via /api/fs`,
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
    return `${directory}/${INDEX_FILENAME}`;
  }

  /** Serializes index rewrites (reindex, delete, rename, keyword edits, imports) within this process. */
  private indexLock: Promise<unknown> = Promise.resolve();

  private withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.indexLock.then(() => fn());
    this.indexLock = run.catch(() => undefined);
    return run;
  }

  private storage(agent?: Agent): MediaStorage {
    const absoluteDir = this.getOutputDirectory();
    if (agent) {
      const fileSystem = agent.requireService(FileSystemService);
      const serveDir = this.getServeDirectory();
      const rel = (filename: string) => `${serveDir}/${filename}`;
      return {
        readIndex: () => fileSystem.readTextFile(this.getIndexPath(serveDir), agent),
        writeIndex: async body => {
          await fileSystem.writeFile(this.getIndexPath(serveDir), body, agent);
        },
        appendIndex: async line => {
          await fileSystem.appendFile(this.getIndexPath(serveDir), line, agent);
        },
        listFiles: async extensions => {
          if (extensions.length === 0) return [];
          // Absolute output directory with hidden dirs included — the workspace lives under dot-directories.
          const files = await fileSystem.glob(`${absoluteDir}/*.{${extensions.join(",")}}`, { includeHidden: true, gitignore: false, aiignore: false }, agent);
          return files.map(file => path.basename(file));
        },
        exists: filename => fileSystem.exists(rel(filename), agent),
        modifiedAt: async filename => {
          try {
            const stat = await fileSystem.stat(rel(filename), agent);
            return stat.exists ? stat.modified?.toISOString() : undefined;
          } catch {
            return undefined;
          }
        },
        writeFile: async (filename, buffer) => {
          await fileSystem.writeFile(rel(filename), buffer, agent);
        },
        deleteFile: async filename => {
          await fileSystem.deleteFile(rel(filename), agent);
        },
        rename: async (from, to) => {
          await fileSystem.rename(rel(from), rel(to), agent);
        },
      };
    }

    const abs = (filename: string) => path.join(absoluteDir, filename);
    // Agentless writes still go through FileSystemService when it is installed, for archiving and write notifications.
    const writeSystem = async (absolutePath: string, content: string | Buffer) => {
      const fileSystem = this.app.getService(FileSystemService);
      if (fileSystem) {
        await fileSystem.writeSystemFile(absolutePath, content);
        return;
      }
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content);
    };
    return {
      readIndex: async () => {
        try {
          return await fs.readFile(this.getIndexPath(absoluteDir), "utf-8");
        } catch {
          return null;
        }
      },
      writeIndex: body => writeSystem(this.getIndexPath(absoluteDir), body),
      appendIndex: async line => {
        await fs.mkdir(absoluteDir, { recursive: true });
        await fs.appendFile(this.getIndexPath(absoluteDir), line);
      },
      listFiles: async extensions => {
        let dirents: Dirent[];
        try {
          dirents = await fs.readdir(absoluteDir, { withFileTypes: true });
        } catch {
          return [];
        }
        const wanted = new Set(extensions.map(ext => ext.toLowerCase()));
        return dirents
          .filter(dirent => dirent.isFile() && wanted.has(dirent.name.split(".").pop()?.toLowerCase() ?? ""))
          .map(dirent => dirent.name)
          .sort();
      },
      exists: async filename => {
        try {
          await fs.access(abs(filename));
          return true;
        } catch {
          return false;
        }
      },
      modifiedAt: async filename => {
        try {
          return (await fs.stat(abs(filename))).mtime.toISOString();
        } catch {
          return undefined;
        }
      },
      writeFile: (filename, buffer) => writeSystem(abs(filename), buffer),
      deleteFile: async filename => {
        const stat = await fs.lstat(abs(filename));
        if (stat.isDirectory()) throw new Error(`${filename} is a directory`);
        await fs.unlink(abs(filename));
      },
      rename: async (from, to) => {
        try {
          await fs.access(abs(to));
          throw new Error(`"${to}" already exists`);
        } catch (error: unknown) {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
        }
        await fs.rename(abs(from), abs(to));
      },
    };
  }

  /** Every index entry in file (oldest-first) order, without filtering or de-duplication. */
  private async readIndexEntries(storage: MediaStorage, agent?: Agent): Promise<MediaLibraryEntry[]> {
    const content = await storage.readIndex();
    if (!content) return [];
    return this.parseIndex(content, this.getIndexPath(this.getOutputDirectory()), agent);
  }

  private parseIndex(content: string, indexPath: string, agent?: Agent): MediaLibraryEntry[] {
    const entries: MediaLibraryEntry[] = [];
    const lines = content.trim().split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.trim()) continue;
      try {
        entries.push(MediaLibraryEntrySchema.parse(JSON.parse(line) as unknown));
      } catch (error: unknown) {
        const message = `Skipping malformed media index entry in ${indexPath} (line ${i + 1})`;
        if (agent) {
          agent.warningMessage(message, error as Error);
        } else {
          console.warn(message, error);
        }
      }
    }
    return entries;
  }

  async writeMedia(options: WriteMediaOptions, agent: Agent): Promise<MediaLibraryEntry & { filePath: string; buffer: Buffer }> {
    const fileSystem = agent.requireService(FileSystemService);
    // FileSystemService + /api/fs resolve relative paths against the workspace directory; absolute path is for exiftool/tools.
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
    const line = JSON.stringify(MediaLibraryEntrySchema.parse(entry)) + "\n";
    await this.withIndexLock(() => this.storage(agent).appendIndex(line));
  }

  /**
   * Read media index entries from a directory, newest first.
   * When `agent` is provided, uses FileSystemService (sandbox/path resolution).
   * Without agent (e.g. RPC), falls back to Node fs for the workspace path.
   */
  async getEntriesFromDirectory(directory: string, options: DirectoryQueryOptions = {}, agent?: Agent): Promise<MediaLibraryEntry[]> {
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

    // A file indexed twice (re-imported, overwritten) lists once, with its newest metadata.
    let filtered = content ? dedupeEntries(this.parseIndex(content, indexPath, agent)) : [];
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

  /** One index entry by file name, or null when it is not indexed. */
  async getEntry(filename: string, agent?: Agent): Promise<MediaLibraryEntry | null> {
    const entries = dedupeEntries(await this.readIndexEntries(this.storage(agent), agent));
    return entries.find(entry => entry.filename === filename) ?? null;
  }

  /** Whether a file of this name exists in the library directory (indexed or not). */
  async mediaFileExists(filename: string, agent?: Agent): Promise<boolean> {
    validateMediaFilename(filename);
    return this.storage(agent).exists(filename);
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

  /** Builds an index entry for a file that has none, from its EXIF/container metadata (falling back to the filesystem). */
  private async entryFromFile(filename: string, storage: MediaStorage, agent?: Agent): Promise<MediaLibraryEntry | null> {
    const detectedKind = kindFromFile(filename);
    const absoluteFile = path.join(this.getOutputDirectory(), filename);
    try {
      const metadata = await exiftool.read(absoluteFile);
      const mimeType = metadata.MIMEType || (detectedKind ? mimeTypeForFile(filename, detectedKind) : "application/octet-stream");
      const kind = kindFromFile(filename, mimeType);
      if (!kind) return null;
      // Optional fields are exactOptional: omit them rather than passing undefined.
      const numeric = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
      const width = numeric(metadata.ImageWidth);
      const height = numeric(metadata.ImageHeight);
      const duration = numeric(metadata.Duration);
      const sampleRate = numeric(metadata.AudioSampleRate);
      const channels = numeric(metadata.AudioChannels);
      return MediaLibraryEntrySchema.parse({
        kind,
        filename,
        mimeType,
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        ...(duration !== undefined && { duration }),
        ...(sampleRate !== undefined && { sampleRate }),
        ...(channels !== undefined && { channels }),
        keywords: normalizeKeywords(metadata.Keywords),
        ...(typeof metadata.ImageDescription === "string" && { prompt: metadata.ImageDescription }),
        createdAt: createdAtFromMetadata(metadata),
      });
    } catch (error: unknown) {
      const message = `Failed to read metadata for ${absoluteFile}`;
      if (agent) agent.warningMessage(message, error as Error);
      else console.warn(message, error);
      // Keep a minimal discoverable entry so the file still shows in the library.
      if (!detectedKind) return null;
      return MediaLibraryEntrySchema.parse({
        kind: detectedKind,
        filename,
        mimeType: mimeTypeForFile(filename, detectedKind),
        keywords: [],
        createdAt: (await storage.modifiedAt(filename)) ?? new Date().toISOString(),
      });
    }
  }

  /**
   * Reconciles the index with the library directory without discarding what
   * the index knows: entries whose file still exists are kept exactly as they
   * are (generated media's prompt, keywords and createdAt live only in the
   * index), files on disk with no entry are added from their EXIF/filesystem
   * metadata, and entries whose file is gone are dropped. Entries of kinds
   * outside `kinds` are left untouched.
   *
   * Works with an agent (FileSystemService, `/media reindex`) or without one (RPC).
   */
  async reindex(agent?: Agent, kinds: MediaKind[] = ["image", "video", "audio"]): Promise<ReindexSummary> {
    return this.withIndexLock(async () => {
      const storage = this.storage(agent);
      const serveDir = this.getServeDirectory();
      agent?.infoMessage(`Reindexing media in ${serveDir} (${this.getOutputDirectory()})...`);

      const existing = dedupeEntries(await this.readIndexEntries(storage, agent));
      const indexed = new Set(existing.map(entry => entry.filename));

      const merged: MediaLibraryEntry[] = [];
      let kept = 0;
      let removed = 0;
      for (const entry of existing) {
        if (!kinds.includes(entry.kind)) {
          merged.push(entry);
        } else if (await storage.exists(entry.filename)) {
          merged.push(entry);
          kept++;
        } else {
          removed++;
        }
      }

      const added: MediaLibraryEntry[] = [];
      for (const filename of await storage.listFiles(extensionsForKinds(kinds))) {
        if (indexed.has(filename)) continue;
        const entry = await this.entryFromFile(filename, storage, agent);
        if (entry && kinds.includes(entry.kind)) added.push(entry);
      }
      // The index is append-ordered (oldest first); new files slot in by their own dates after the known ones.
      added.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

      const all = [...merged, ...added];
      await storage.writeIndex(serializeIndex(all));
      const summary: ReindexSummary = { total: all.length, added: added.length, removed, kept };
      agent?.infoMessage(
        `Reindexed media library: ${summary.added} added, ${summary.removed} removed, ${summary.kept} kept (${summary.total} total in index).`,
      );
      return summary;
    });
  }

  /** Rewrites the index through `edit` under the index lock. */
  private async rewriteIndex<T>(
    agent: Agent | undefined,
    edit: (entries: MediaLibraryEntry[], storage: MediaStorage) => Promise<{ entries: MediaLibraryEntry[]; result: T }>,
  ): Promise<T> {
    return this.withIndexLock(async () => {
      const storage = this.storage(agent);
      const entries = dedupeEntries(await this.readIndexEntries(storage, agent));
      const next = await edit(entries, storage);
      await storage.writeIndex(serializeIndex(next.entries));
      return next.result;
    });
  }

  /** Agents (every one, or just `agent`) whose media selection points at `filename`. */
  private agentsSelecting(filename: string, agent?: Agent): Agent[] {
    const candidates = agent ? [agent] : (this.app.getService(AgentManager)?.getAgents() ?? []);
    return candidates.filter(candidate => {
      try {
        const state = candidate.getState(MediaLibraryState);
        return state.selectedFilename === filename || state.lastAttachedFilename === filename;
      } catch {
        return false;
      }
    });
  }

  /**
   * Deletes a library file and its index entry, and clears any agent's
   * selection of it. A file already gone from disk still loses its entry.
   * Returns how many agents had it selected.
   */
  async deleteMedia(filename: string, agent?: Agent): Promise<{ clearedSelections: number }> {
    validateMediaFilename(filename);
    await this.rewriteIndex(agent, async (entries, storage) => {
      const known = entries.some(entry => entry.filename === filename);
      const onDisk = await storage.exists(filename);
      if (!known && !onDisk) throw new Error(`"${filename}" is not in the media library`);
      if (onDisk) await storage.deleteFile(filename);
      return { entries: entries.filter(entry => entry.filename !== filename), result: undefined };
    });

    const selecting = this.agentsSelecting(filename, agent);
    for (const target of selecting) {
      target.mutateState(MediaLibraryState, state => {
        if (state.selectedFilename === filename) {
          state.selectedFilename = undefined;
          state.selectedKind = undefined;
        }
        if (state.lastAttachedFilename === filename) state.lastAttachedFilename = undefined;
      });
    }
    return { clearedSelections: selecting.length };
  }

  /**
   * Renames a library file, carrying its index entry (prompt, keywords, dates)
   * and any agent's selection over to the new name. The new name must keep the
   * file's media kind and must not exist yet.
   */
  async renameMedia(filename: string, newFilename: string, agent?: Agent): Promise<MediaLibraryEntry> {
    validateMediaFilename(filename);
    const newKind = validateMediaFilename(newFilename);
    if (filename === newFilename) {
      const entry = await this.getEntry(filename, agent);
      if (!entry) throw new Error(`"${filename}" is not in the media library`);
      return entry;
    }

    const renamed = await this.rewriteIndex(agent, async (entries, storage) => {
      const current = entries.find(entry => entry.filename === filename);
      if (!current) throw new Error(`"${filename}" is not in the media library`);
      if (current.kind !== newKind) throw new Error(`"${newFilename}" is not a ${current.kind} file name; keep the ${current.kind} extension`);
      if (!(await storage.exists(filename))) throw new Error(`"${filename}" no longer exists on disk; refresh the library`);
      if (await storage.exists(newFilename)) throw new Error(`"${newFilename}" already exists`);
      await storage.rename(filename, newFilename);
      const entry: MediaLibraryEntry = { ...current, filename: newFilename, mimeType: current.mimeType || mimeTypeForFile(newFilename, newKind) };
      return {
        entries: entries.filter(candidate => candidate.filename !== newFilename).map(candidate => (candidate.filename === filename ? entry : candidate)),
        result: entry,
      };
    });

    for (const target of this.agentsSelecting(filename, agent)) {
      target.mutateState(MediaLibraryState, state => {
        if (state.selectedFilename === filename) state.selectedFilename = newFilename;
        if (state.lastAttachedFilename === filename) state.lastAttachedFilename = newFilename;
      });
    }
    return renamed;
  }

  /** Replaces an entry's keywords (trimmed, de-duplicated case-insensitively). */
  async updateKeywords(filename: string, keywords: readonly string[], agent?: Agent): Promise<MediaLibraryEntry> {
    validateMediaFilename(filename);
    const normalized = normalizeKeywordList(keywords);
    return this.rewriteIndex(agent, async entries => {
      const current = entries.find(entry => entry.filename === filename);
      if (!current) throw new Error(`"${filename}" is not in the media library`);
      const entry: MediaLibraryEntry = { ...current, keywords: normalized };
      return { entries: entries.map(candidate => (candidate.filename === filename ? entry : candidate)), result: entry };
    });
  }

  /**
   * Imports an uploaded file into the library and indexes it from its own
   * metadata. Refuses to replace an existing file unless `overwrite` is set;
   * an overwritten file's entry is re-read from the new content.
   */
  async importMedia(options: { filename: string; buffer: Buffer; overwrite?: boolean | undefined }, agent?: Agent): Promise<MediaLibraryEntry> {
    const { filename, buffer, overwrite = false } = options;
    const kind = validateMediaFilename(filename);
    return this.rewriteIndex(agent, async (entries, storage) => {
      if (!overwrite && (await storage.exists(filename))) throw new Error(`"${filename}" already exists in the media library`);
      await storage.writeFile(filename, buffer);
      const fromFile = await this.entryFromFile(filename, storage, agent);
      const entry: MediaLibraryEntry = {
        ...(fromFile ?? { kind, filename, mimeType: mimeTypeForFile(filename, kind), keywords: [] }),
        // An upload is new to the library now, whatever date the file carries.
        createdAt: new Date().toISOString(),
      };
      if (fromFile && fromFile.kind !== kind) entry.kind = fromFile.kind;
      return { entries: [...entries.filter(candidate => candidate.filename !== filename), entry], result: entry };
    });
  }
}
