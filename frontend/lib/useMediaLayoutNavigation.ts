import { usePaneLink } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useCallback } from "react";
import type { MediaKind } from "../features/media/types.ts";
import { MEDIA_GENERATE_VIEW_ID, MEDIA_ITEM_VIEW_ID } from "../ids.ts";

/**
 * Navigation between the Media views on the layout engine. Opening a file
 * navigates to its URL (the engine opens its tab); the "Select media"
 * placeholder has done its job then, so it closes.
 */
export function useMediaLayoutNavigation() {
  const open = usePaneLink();

  const openItem = useCallback(
    (filename: string) => {
      open(MEDIA_ITEM_VIEW_ID, { filename });
    },
    [open],
  );

  /** Opens the generation form for one kind; the tabs of different kinds coexist. */
  const openGenerate = useCallback((kind: MediaKind) => open(MEDIA_GENERATE_VIEW_ID, { kind }), [open]);

  /** Opens (or focuses) the chat tab for an agent beside the media. */
  const openAgentChat = useCallback((agentId: string) => open("chat", { agentId }), [open]);

  return { openItem, openGenerate, openAgentChat };
}
