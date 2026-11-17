import { triggerDownloadFromUrl } from "@tokenring-ai/one-frontend/lib/triggerDownloadFromUrl.ts";
import { workspaceFileUrl } from "@tokenring-ai/one-frontend/lib/workspaceFileUrl.ts";

/**
 * Default `/api/fs` path when config has not loaded yet.
 * Matches default layout: workspaceDirectory = `<working>/.tokenring`, outputDirectory = `media-library`.
 */
export const DEFAULT_MEDIA_SERVE_DIRECTORY = ".tokenring/media-library";

export type MediaUrlOptions = {
  /**
   * Workspace-relative directory for `/api/fs/...` (e.g. `.tokenring/media-library`).
   * Prefer `serveDirectory` from `getMediaLibraryConfiguration` when available.
   */
  directory?: string;
};

/** HTTP URL for a media-library file served via the filesystem plugin. */
export function mediaUrl(filename: string, options: MediaUrlOptions = {}): string {
  const directory = options.directory ?? DEFAULT_MEDIA_SERVE_DIRECTORY;
  const filePath = `${directory.replace(/\/+$/, "")}/${filename}`;
  return workspaceFileUrl(filePath);
}

export function aspectLabel(width: number, height: number) {
  if (width === height) return "Square";
  if (width > height) return "Wide";
  return "Tall";
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Extract lightweight keywords from a free-text prompt for media-library metadata. */
export function keywordsFromPrompt(prompt: string, limit = 10): string[] {
  return prompt
    .trim()
    .split(/[,\s]+/)
    .map(part => part.replace(/[^\p{L}\p{N}-]+/gu, ""))
    .filter(Boolean)
    .slice(0, limit);
}

/** Trigger a browser download for a media-library file. Falls back to opening the URL if fetch fails. */
export async function downloadMedia(filename: string, options: MediaUrlOptions = {}): Promise<void> {
  await triggerDownloadFromUrl({
    url: mediaUrl(filename, options),
    filename,
  });
}

export function workOnMediaMessage(kind: "image" | "video" | "audio", filename: string, keywords: string[] = [], options: MediaUrlOptions = {}): string {
  const kw = keywords.length > 0 ? keywords.join(", ") : "none";
  return [
    `Please help me work with this ${kind} from the media library.`,
    `Filename: ${filename}`,
    `URL: ${mediaUrl(filename, options)}`,
    `Keywords: ${kw}`,
  ].join("\n");
}
