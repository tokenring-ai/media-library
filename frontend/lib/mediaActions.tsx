import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useFileUpload } from "@tokenring-ai/one-frontend/hooks/useFileUpload.ts";
import { mediaLibraryRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Dialog, TextField, toastManager } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useRef, useState } from "react";
import type { MediaEntry } from "../features/media/types.ts";
import { markGenerated, refreshMediaLibrary } from "./mediaStore.ts";

/**
 * Library mutations for the Media views: reindex, upload, delete, rename and
 * keyword edits. Every one refreshes all mounted library streams afterwards.
 */

/** Matches useFileUpload's base64 default and stays under the RPC socket's frame limit. */
export const MEDIA_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v", "mpeg", "mpg"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac"];

/** `accept` attribute for the upload picker. */
export const MEDIA_UPLOAD_ACCEPT = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].map(ext => `.${ext}`).join(",");

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Client-side mirror of the service's file-name rule; the server validates again. */
export function validateMediaName(name: string, kind?: MediaEntry["kind"]): string | null {
  if (!name.trim()) return "Name is required";
  if (name.trim() !== name) return "Name cannot start or end with spaces";
  if (name.includes("/") || name.includes("\\")) return "Name cannot contain path separators";
  if (name.startsWith(".")) return "Name cannot start with a dot";
  if (name === "media_index.json") return "That name is reserved";
  const ext = extensionOf(name);
  const extensions = kind === "image" ? IMAGE_EXTENSIONS : kind === "video" ? VIDEO_EXTENSIONS : kind === "audio" ? AUDIO_EXTENSIONS : null;
  if (extensions && !extensions.includes(ext)) return `Keep a ${kind} extension (${extensions.map(e => `.${e}`).join(", ")})`;
  if (!extensions && ![...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].includes(ext)) return "Not an image, video or audio file";
  return null;
}

/**
 * Reconciles the library index with the folder (keeping every entry's prompt
 * and keywords), then refreshes the gallery. Files dropped into the folder by
 * hand appear; entries for deleted files go away.
 */
export async function reindexMediaLibrary(): Promise<void> {
  try {
    const { added, removed } = await mediaLibraryRPCClient.reindexMedia({});
    if (added > 0 || removed > 0) {
      const parts = [added > 0 ? `${added} added` : null, removed > 0 ? `${removed} removed` : null].filter(Boolean);
      toastManager.success(`Library refreshed: ${parts.join(", ")}`, { duration: 3000 });
    }
  } catch (error: unknown) {
    toastManager.error(`Could not rescan the media folder: ${formatError(error)}`, { duration: 4000 });
  } finally {
    refreshMediaLibrary();
  }
}

/** Upload (import) files into the library through the hidden file input it returns. */
export function useMediaUpload(onUploaded?: (filenames: string[]) => void) {
  const uploadedRef = useRef<string[]>([]);
  return useFileUpload({
    encoding: "base64",
    maxSize: MEDIA_UPLOAD_MAX_BYTES,
    maxSizeLabel: "10 MB",
    validateFileName: name => validateMediaName(name) ?? true,
    uploadFile: async ({ filePath, content }) => {
      // The overwrite question (if any) was already answered by useFileUpload.
      await mediaLibraryRPCClient.importMedia({ filename: filePath, contentBase64: content, overwrite: true });
      markGenerated(filePath);
      uploadedRef.current.push(filePath);
    },
    checkExists: ({ filePath }) => mediaLibraryRPCClient.mediaFileExists({ filename: filePath }),
    onSkip: ({ fileName, reason, detail }) => {
      if (reason === "exists") return;
      toastManager.error(detail ?? `Skipped "${fileName}"`, { duration: 4000 });
    },
    onError: ({ fileName, error }) => {
      toastManager.error(`Failed to upload "${fileName}": ${formatError(error)}`, { duration: 4000 });
    },
    onComplete: ({ uploaded: count }) => {
      refreshMediaLibrary();
      if (count > 0) toastManager.success(count === 1 ? "Uploaded 1 file" : `Uploaded ${count} files`, { duration: 2500 });
      const names = uploadedRef.current;
      uploadedRef.current = [];
      if (names.length > 0) onUploaded?.(names);
    },
  });
}

export interface MediaItemActions {
  requestDelete: () => Promise<void>;
  openRename: () => void;
  saveKeywords: (keywords: string[]) => Promise<boolean>;
  busy: boolean;
  /** Mount once beside the actions. */
  dialogs: React.ReactNode;
}

/**
 * Delete, rename and keyword edits for one entry. `onDeleted` and `onRenamed`
 * let the panel close itself or follow the file to its new name.
 */
export function useMediaItemActions(
  entry: MediaEntry,
  { onDeleted, onRenamed }: { onDeleted: () => void; onRenamed: (filename: string) => void },
): MediaItemActions {
  const { openConfirm, Dialog: ConfirmDialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const requestDelete = useCallback(async () => {
    const ok = await openConfirm({
      title: "Delete media",
      message: `Delete “${entry.filename}” from the media library? The file is removed from disk and cannot be restored.`,
      confirmText: "Delete",
      variant: "danger",
      id: "media-delete",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await mediaLibraryRPCClient.deleteMedia({ filename: entry.filename });
      toastManager.success(`Deleted ${entry.filename}`, { duration: 2500 });
      refreshMediaLibrary();
      onDeleted();
    } catch (error: unknown) {
      toastManager.error(`Delete failed: ${formatError(error)}`, { duration: 4000 });
    } finally {
      setBusy(false);
    }
  }, [entry.filename, onDeleted, openConfirm]);

  const submitRename = async () => {
    if (renameValue === null) return;
    const next = renameValue.trim();
    const invalid = validateMediaName(next, entry.kind);
    if (invalid) {
      setRenameError(invalid);
      return;
    }
    if (next === entry.filename) {
      setRenameValue(null);
      return;
    }
    setBusy(true);
    setRenameError(null);
    try {
      const { entry: renamed } = await mediaLibraryRPCClient.renameMedia({ filename: entry.filename, newFilename: next });
      // The stream may still list the old name for a moment; let the new panel wait for it.
      markGenerated(renamed.filename);
      refreshMediaLibrary();
      setRenameValue(null);
      toastManager.success(`Renamed to ${renamed.filename}`, { duration: 2500 });
      onRenamed(renamed.filename);
    } catch (error: unknown) {
      setRenameError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const saveKeywords = useCallback(
    async (keywords: string[]): Promise<boolean> => {
      try {
        await mediaLibraryRPCClient.updateMediaKeywords({ filename: entry.filename, keywords });
        refreshMediaLibrary();
        return true;
      } catch (error: unknown) {
        toastManager.error(`Could not save tags: ${formatError(error)}`, { duration: 4000 });
        return false;
      }
    },
    [entry.filename],
  );

  const dialogs = (
    <>
      <ConfirmDialog />
      <Dialog
        open={renameValue !== null}
        title="Rename media"
        onClose={() => {
          if (!busy) setRenameValue(null);
        }}
        width="w-96"
        busy={busy}
        error={renameError}
        confirmLabel="Rename"
        onConfirm={() => void submitRename()}
        confirmDisabled={!renameValue?.trim()}
        footerClassName="mt-4"
      >
        <TextField
          label="File name"
          value={renameValue ?? ""}
          onChange={value => {
            setRenameValue(value);
            setRenameError(null);
          }}
          onKeyDown={event => {
            if (event.key === "Enter") void submitRename();
          }}
          autoFocus
          aria-label="New file name"
        />
      </Dialog>
    </>
  );

  return {
    requestDelete,
    openRename: () => {
      setRenameError(null);
      setRenameValue(entry.filename);
    },
    saveKeywords,
    busy,
    dialogs,
  };
}
