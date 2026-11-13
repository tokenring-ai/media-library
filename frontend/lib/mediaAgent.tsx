import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useAppAgentSession } from "@tokenring-ai/one-frontend/hooks/useAppAgentSession.tsx";
import { useRefSync } from "@tokenring-ai/one-frontend/hooks/useRefSync.ts";
import { toastOnReject } from "@tokenring-ai/one-frontend/lib/toastOnReject.ts";
import { agentRPCClient, mediaLibraryRPCClient, useMediaLibraryConfiguration } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useEffect } from "react";
import { AGENT_TYPE_PREFERENCES, MEDIA_AGENT_TYPES } from "../features/media/constants.ts";
import type { MediaEntry } from "../features/media/types.ts";
import { workOnMediaMessage } from "../features/media/utils.ts";

/**
 * Agent hooks shared by the Media panes on the layout engine: the attached
 * agent session and the selection the agent's tools act on.
 */

export interface MediaAgentSession extends ReturnType<typeof useAppAgentSession> {
  /** Agent types the media library is configured for. */
  agentTypes: string[];
  /**
   * The attached agent, creating one on demand — generation, transcription and
   * "work on this" all need an agent, and the old app kept a hidden headless
   * one around for exactly that.
   */
  ensureAgent: (preferredTypes?: readonly string[]) => Promise<string | null>;
}

/**
 * The Media dashboard's agent session. Every view shares one selection: the
 * hook persists it under `agentSession:media`, and instances stay in sync
 * within the document.
 */
export function useMediaAgentSession(): MediaAgentSession {
  const configuration = useMediaLibraryConfiguration();
  // Fallback matches MediaLibraryServiceConfigSchema.agentTypes so an agent can be
  // created before the configuration RPC returns.
  const agentTypes = configuration.data?.agentTypes ?? [...MEDIA_AGENT_TYPES];
  const session = useAppAgentSession({ appName: "Media dashboard", storageKey: "media", agentTypes });
  const { agentId, createAgent } = session;
  const agentTypesRef = useRefSync(agentTypes);

  const ensureAgent = useCallback(
    async (preferredTypes?: readonly string[]): Promise<string | null> => {
      if (agentId) return agentId;
      const allowed = agentTypesRef.current;
      // Prefer a kind-specific type that the media library is also configured for.
      const type = preferredTypes?.find(candidate => allowed.includes(candidate)) ?? allowed[0];
      return createAgent(type);
    },
    [agentId, agentTypesRef, createAgent],
  );

  return { ...session, agentTypes, ensureAgent };
}

/**
 * The selection this document last pushed to an agent. A panel that closes
 * clears the agent's selection only when it is still the one that set it, so
 * closing a background panel never wipes what the active panel selected.
 */
let syncedSelection: { agentId: string; filename: string } | null = null;

/** Test helper. */
export function resetSyncedMediaSelection(): void {
  syncedSelection = null;
}

/**
 * Tells the attached agent which file the user is looking at, so its tools act
 * on it, and clears that selection again when the panel showing it closes.
 */
export function useSyncMediaSelection(agentId: string | null, entry: Pick<MediaEntry, "filename" | "kind"> | null): void {
  const filename = entry?.filename ?? null;
  const kind = entry?.kind ?? null;
  useEffect(() => {
    if (!agentId || !filename || !kind) return;
    syncedSelection = { agentId, filename };
    toastOnReject(mediaLibraryRPCClient.updateMediaLibraryState({ agentId, selectedFilename: filename, selectedKind: kind }), {
      message: error => `Media selection could not be synced to the agent: ${formatError(error)}`,
      type: "warning",
      duration: 4000,
    });
  }, [agentId, filename, kind]);

  // Unmount is the panel closing (item panels stay mounted while hidden).
  const filenameRef = useRefSync(filename);
  useEffect(
    () => () => {
      const selection = syncedSelection;
      if (!selection || selection.filename !== filenameRef.current) return;
      syncedSelection = null;
      toastOnReject(mediaLibraryRPCClient.updateMediaLibraryState({ agentId: selection.agentId, clearSelection: true }), {
        message: error => `Media selection could not be cleared: ${formatError(error)}`,
        type: "warning",
        duration: 4000,
      });
    },
    [filenameRef],
  );
}

/**
 * Hands one media file to an agent: syncs the selection (best effort) and
 * sends the same "work on this" prompt the old app did. Returns the agent that
 * got it, or null when none could be started.
 */
export async function workOnMedia(
  ensureAgent: (preferredTypes?: readonly string[]) => Promise<string | null>,
  entry: MediaEntry,
  serveDirectory: string,
): Promise<string | null> {
  const agentId = await ensureAgent(AGENT_TYPE_PREFERENCES[entry.kind]);
  // ensureAgent already toasts when the agent could not be created.
  if (!agentId) return null;
  try {
    await mediaLibraryRPCClient.updateMediaLibraryState({ agentId, selectedFilename: entry.filename, selectedKind: entry.kind });
  } catch (error: unknown) {
    // Non-fatal — the agent still gets the prompt, but its tools lack the selection.
    toastManager.warning(`Media selection could not be synced: ${formatError(error)}`, { duration: 4000 });
  }
  try {
    await agentRPCClient.sendInput({
      agentId,
      input: {
        from: "Media app",
        message: workOnMediaMessage(entry.kind, entry.filename, entry.keywords, { directory: serveDirectory }),
      },
    });
  } catch (error: unknown) {
    toastManager.error(formatError(error), { duration: 5000 });
    return null;
  }
  return agentId;
}
