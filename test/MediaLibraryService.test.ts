import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import TokenRingApp from "@tokenring-ai/app";
import { exiftool } from "exiftool-vendored";
import MediaLibraryService, { validateMediaFilename } from "../MediaLibraryService.ts";
import { type MediaLibraryEntry, MediaLibraryServiceConfigSchema } from "../schema.ts";
import { MediaLibraryState } from "../state/MediaLibraryState.ts";

/** A valid 1×1 PNG, so exiftool can read real metadata from files added on disk. */
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let workspace: string;
let mediaDir: string;
let app: TokenRingApp;
let service: MediaLibraryService;

function createApp(workspaceDirectory: string): TokenRingApp {
  return new TokenRingApp({
    app: {
      workingDirectory: workspaceDirectory,
      workspaceDirectory,
      configDirectories: [],
      shutdownMonitorIntervalMs: 2000,
      serviceRestartDelayMs: 5000,
      printLogs: false,
    },
  });
}

async function writeIndex(entries: MediaLibraryEntry[]): Promise<void> {
  await fs.writeFile(path.join(mediaDir, "media_index.json"), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
}

async function readIndex(): Promise<MediaLibraryEntry[]> {
  const content = await fs.readFile(path.join(mediaDir, "media_index.json"), "utf-8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line) as MediaLibraryEntry);
}

const generated: MediaLibraryEntry = {
  kind: "image",
  filename: "generated.png",
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  keywords: ["panda", "forest"],
  prompt: "a red panda in a forest",
  createdAt: "2025-01-02T03:04:05.000Z",
};

const generatedClip: MediaLibraryEntry = {
  kind: "audio",
  filename: "speech.mp3",
  mimeType: "audio/mpeg",
  keywords: ["greeting"],
  prompt: "hello there",
  createdAt: "2025-01-03T00:00:00.000Z",
};

/**
 * Minimal stand-in for an agent whose FileSystemService works on the real
 * disk, so the `/media reindex` (agent) code path is exercised too.
 */
function createFakeAgent(): Agent & { infos: string[] } {
  const resolve = (filePath: string) => (path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath));
  const fileSystem = {
    readTextFile: async (filePath: string) => {
      try {
        return await fs.readFile(resolve(filePath), "utf-8");
      } catch {
        return null;
      }
    },
    writeFile: async (filePath: string, content: string | Buffer) => {
      await fs.mkdir(path.dirname(resolve(filePath)), { recursive: true });
      await fs.writeFile(resolve(filePath), content);
      return true;
    },
    appendFile: async (filePath: string, content: string | Buffer) => {
      await fs.appendFile(resolve(filePath), content);
      return true;
    },
    glob: async (pattern: string) => {
      const files: string[] = [];
      for await (const file of new Bun.Glob(pattern).scan({ absolute: true, dot: true })) files.push(file);
      return files.sort();
    },
    exists: async (filePath: string) => {
      try {
        await fs.access(resolve(filePath));
        return true;
      } catch {
        return false;
      }
    },
    stat: async (filePath: string) => {
      const stat = await fs.stat(resolve(filePath));
      return { exists: true, path: filePath, modified: stat.mtime };
    },
    deleteFile: async (filePath: string) => {
      await fs.unlink(resolve(filePath));
      return true;
    },
    rename: async (from: string, to: string) => {
      await fs.rename(resolve(from), resolve(to));
      return true;
    },
  };
  const states = new Map<unknown, unknown>([[MediaLibraryState, new MediaLibraryState()]]);
  const infos: string[] = [];
  return {
    infos,
    requireService: () => fileSystem,
    infoMessage: (message: string) => infos.push(message),
    warningMessage: () => undefined,
    getState: (cls: unknown) => states.get(cls),
    mutateState: (cls: unknown, fn: (state: unknown) => void) => fn(states.get(cls)),
  } as unknown as Agent & { infos: string[] };
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "media-library-test-"));
  mediaDir = path.join(workspace, "media-library");
  await fs.mkdir(mediaDir, { recursive: true });
  app = createApp(workspace);
  service = new MediaLibraryService(app, MediaLibraryServiceConfigSchema.parse({}));
});

afterAll(async () => {
  await exiftool.end();
});

describe("MediaLibraryService.reindex", () => {
  it("keeps generated entries' prompt, keywords and createdAt, adds new files and drops removed ones (agentless)", async () => {
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await fs.writeFile(path.join(mediaDir, "dropped-in.png"), PNG_1X1);
    await writeIndex([generated, { ...generated, filename: "gone.png", prompt: "deleted outside the app" }]);

    const summary = await service.reindex();

    expect(summary).toEqual({ total: 2, added: 1, removed: 1, kept: 1 });
    const index = await readIndex();
    expect(index.map(entry => entry.filename)).toEqual(["generated.png", "dropped-in.png"]);
    expect(index[0]).toEqual(generated);
    expect(index[1]).toMatchObject({ kind: "image", filename: "dropped-in.png", mimeType: "image/png", width: 1, height: 1, keywords: [] });
    expect(index[1]?.createdAt).toBeString();
  });

  it("survives a reindex through the agent (FileSystemService) path used by /media reindex", async () => {
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await fs.writeFile(path.join(mediaDir, "speech.mp3"), "not really audio");
    await writeIndex([generated, generatedClip]);
    const agent = createFakeAgent();

    const summary = await service.reindex(agent);

    expect(summary).toEqual({ total: 2, added: 0, removed: 0, kept: 2 });
    expect(await readIndex()).toEqual([generated, generatedClip]);
    expect(agent.infos.at(-1)).toContain("0 added, 0 removed, 2 kept");
  });

  it("leaves entries of other kinds untouched when reindexing one kind", async () => {
    // speech.mp3 is not on disk, but an image-only pass must not judge audio entries.
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await writeIndex([generatedClip, generated]);

    const summary = await service.reindex(undefined, ["image"]);

    expect(summary).toEqual({ total: 2, added: 0, removed: 0, kept: 1 });
    expect(await readIndex()).toEqual([generatedClip, generated]);
  });

  it("collapses duplicate index lines to the newest metadata", async () => {
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await writeIndex([{ ...generated, keywords: ["old"] }, generated]);

    await service.reindex();

    expect(await readIndex()).toEqual([generated]);
  });
});

describe("MediaLibraryService mutations", () => {
  it("deletes a file and its entry and clears an agent's selection of it", async () => {
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await writeIndex([generated, generatedClip]);
    const agent = createFakeAgent();
    agent.mutateState(MediaLibraryState, state => {
      state.selectedFilename = "generated.png";
      state.selectedKind = "image";
    });

    const result = await service.deleteMedia("generated.png", agent);

    expect(result.clearedSelections).toBe(1);
    expect(agent.getState(MediaLibraryState).selectedFilename).toBeUndefined();
    expect(await Bun.file(path.join(mediaDir, "generated.png")).exists()).toBe(false);
    expect((await readIndex()).map(entry => entry.filename)).toEqual(["speech.mp3"]);
  });

  it("drops the entry of a file already removed from disk, and rejects unknown files", async () => {
    await writeIndex([generated]);
    await service.deleteMedia("generated.png");
    expect(await readIndex()).toEqual([]);
    await expect(service.deleteMedia("missing.png")).rejects.toThrow("not in the media library");
  });

  it("renames a file, carrying its metadata and agent selection", async () => {
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await writeIndex([generated]);
    const agent = createFakeAgent();
    agent.mutateState(MediaLibraryState, state => {
      state.selectedFilename = "generated.png";
    });

    const entry = await service.renameMedia("generated.png", "panda.png", agent);

    expect(entry).toEqual({ ...generated, filename: "panda.png" });
    expect(await readIndex()).toEqual([{ ...generated, filename: "panda.png" }]);
    expect(await Bun.file(path.join(mediaDir, "panda.png")).exists()).toBe(true);
    expect(agent.getState(MediaLibraryState).selectedFilename).toBe("panda.png");
  });

  it("refuses renames that change the kind, collide or escape the directory", async () => {
    await fs.writeFile(path.join(mediaDir, "generated.png"), PNG_1X1);
    await fs.writeFile(path.join(mediaDir, "other.png"), PNG_1X1);
    await writeIndex([generated]);

    await expect(service.renameMedia("generated.png", "generated.mp3")).rejects.toThrow("keep the image extension");
    await expect(service.renameMedia("generated.png", "other.png")).rejects.toThrow("already exists");
    await expect(service.renameMedia("generated.png", "../escape.png")).rejects.toThrow("path separators");
    expect(await readIndex()).toEqual([generated]);
  });

  it("replaces keywords, trimming and de-duplicating them", async () => {
    await writeIndex([generated]);
    const entry = await service.updateKeywords("generated.png", [" sunset ", "Beach", "beach", ""]);
    expect(entry.keywords).toEqual(["sunset", "Beach"]);
    expect((await readIndex())[0]).toEqual({ ...generated, keywords: ["sunset", "Beach"] });
  });

  it("imports an uploaded file, refusing to overwrite unless asked", async () => {
    await writeIndex([generated]);

    const entry = await service.importMedia({ filename: "upload.png", buffer: PNG_1X1 });

    expect(entry).toMatchObject({ kind: "image", filename: "upload.png", width: 1, height: 1 });
    expect((await readIndex()).map(item => item.filename)).toEqual(["generated.png", "upload.png"]);
    await expect(service.importMedia({ filename: "upload.png", buffer: PNG_1X1 })).rejects.toThrow("already exists");
    await service.importMedia({ filename: "upload.png", buffer: PNG_1X1, overwrite: true });
    expect((await readIndex()).map(item => item.filename)).toEqual(["generated.png", "upload.png"]);
    await expect(service.importMedia({ filename: "notes.txt", buffer: Buffer.from("x") })).rejects.toThrow("supported");
  });
});

describe("validateMediaFilename", () => {
  it("accepts bare media file names and rejects everything else", () => {
    expect(validateMediaFilename("cat.JPG")).toBe("image");
    expect(validateMediaFilename("clip.webm")).toBe("video");
    expect(() => validateMediaFilename("a/b.png")).toThrow();
    expect(() => validateMediaFilename(".hidden.png")).toThrow();
    expect(() => validateMediaFilename("media_index.json")).toThrow();
    expect(() => validateMediaFilename(" x.png")).toThrow();
  });
});
