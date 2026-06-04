import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentCreationContext } from "@tokenring-ai/agent/types";
import type { TokenRingService } from "@tokenring-ai/app/types";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import { generateHumanId } from "@tokenring-ai/utility/string/generateHumanId";
import { exiftool } from "exiftool-vendored";
import fs from "node:fs/promises";
import path from "node:path";
import { MediaLibraryAgentConfigSchema, type MediaKind, type MediaLibraryEntry, MediaLibraryEntrySchema, type ParsedMediaLibraryConfig } from "./schema.ts";
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

function normalizeKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1.0;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;

  const aWords = aLower.split(/\s+/);
  const bWords = bLower.split(/\s+/);
  const matches = aWords.filter(w => bWords.includes(w)).length;
  return matches / Math.max(aWords.length, bWords.length);
}

export default class MediaLibraryService implements TokenRingService {
  readonly name = "MediaLibraryService";
  description = "Shared media library storage, indexing, search, and static serving";

  constructor(private options: ParsedMediaLibraryConfig) {}

  attach(agent: Agent, creationContext: AgentCreationContext): void {
    const agentConfig = deepClone(this.options.agentDefaults, agent.getAgentConfigSlice("mediaLibrary", MediaLibraryAgentConfigSchema));
    const initialState = agent.initializeState(MediaLibraryState, agentConfig);
    creationContext.items.push(`Media Library Directory: ${initialState.outputDirectory}`);
  }

  getStaticPath(): string {
    return this.options.staticPath;
  }

  getDefaultOutputDirectory(): string {
    return this.options.agentDefaults.outputDirectory;
  }

  getOutputDirectory(agent: Agent): string {
    return agent.getState(MediaLibraryState).outputDirectory;
  }

  getIndexPath(directory: string): string {
    return `${directory}/media_index.json`;
  }

  getLegacyImageIndexPath(directory: string): string {
    return `${directory}/image_index.json`;
  }

  async writeMedia(options: WriteMediaOptions, agent: Agent): Promise<MediaLibraryEntry & { filePath: string; buffer: Buffer }> {
    const fileSystem = agent.requireServiceByType(FileSystemService);
    const targetDir = this.getOutputDirectory(agent);
    const extension = options.extension ?? extensionFromMimeType(options.mimeType);
    const filename = options.filename ?? `${generateHumanId()}.${extension}`;
    const filePath = `${targetDir}/${filename}`;

    await fileSystem.writeFile(filePath, options.buffer, agent);

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
    return { ...entry, filePath, buffer: options.buffer };
  }

  async addToIndex(entry: MediaLibraryEntry, agent: Agent): Promise<void> {
    const fileSystem = agent.requireServiceByType(FileSystemService);
    const targetDir = this.getOutputDirectory(agent);
    await fileSystem.appendFile(this.getIndexPath(targetDir), JSON.stringify(MediaLibraryEntrySchema.parse(entry)) + "\n", agent);
  }

  async getEntriesFromDirectory(directory: string, options: SearchOptions & { search?: string | undefined } = {}): Promise<MediaLibraryEntry[]> {
    const entries: MediaLibraryEntry[] = [];
    const paths = [this.getIndexPath(directory), this.getLegacyImageIndexPath(directory)];

    for (const indexPath of paths) {
      let content: string;
      try {
        content = await fs.readFile(indexPath, "utf-8");
      } catch {
        continue;
      }

      for (const line of content.trim().split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const kind = parsed.kind ?? kindFromFile(parsed.filename, parsed.mimeType);
          if (!kind) continue;
          entries.push(
            MediaLibraryEntrySchema.parse({
              ...parsed,
              kind,
              keywords: parsed.keywords ?? [],
            }),
          );
        } catch {
          // Ignore malformed index entries.
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
    const targetDir = this.getOutputDirectory(agent);
    const entries = await this.getEntriesFromDirectory(targetDir, { kind: options.kind });
    const results: Array<MediaLibraryEntry & { score: number; path: string }> = [];

    for (const entry of entries) {
      const searchable = [entry.filename, entry.prompt, ...entry.keywords].filter(Boolean).join(" ");
      const score = similarity(query, searchable);
      if (score > 0) {
        results.push({ ...entry, score, path: `${targetDir}/${entry.filename}` });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.limit ?? 10);
  }

  async reindex(agent: Agent, kinds: MediaKind[] = ["image", "video", "audio"]): Promise<number> {
    const targetDir = this.getOutputDirectory(agent);
    const fileSystem = agent.requireServiceByType(FileSystemService);
    const extensions = [
      ...(kinds.includes("image") ? IMAGE_EXTENSIONS : []),
      ...(kinds.includes("video") ? VIDEO_EXTENSIONS : []),
      ...(kinds.includes("audio") ? AUDIO_EXTENSIONS : []),
    ];

    agent.infoMessage(`Reindexing media in ${targetDir}...`);

    const files = await fileSystem.glob(`${targetDir}/*.{${extensions.join(",")}}`, {}, agent);
    const entries: string[] = [];

    for (const file of files) {
      try {
        const metadata = await exiftool.read(file);
        const filename = path.basename(file);
        const detectedKind = kindFromFile(file);
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
          createdAt: new Date().toISOString(),
        });
        entries.push(JSON.stringify(entry));
      } catch (error: unknown) {
        agent.warningMessage(`Failed to read metadata for ${file}`, error as Error);
      }
    }

    await fileSystem.writeFile(this.getIndexPath(targetDir), entries.join("\n") + (entries.length ? "\n" : ""), agent);
    agent.infoMessage(`Reindexed ${entries.length} media files.`);
    return entries.length;
  }
}
