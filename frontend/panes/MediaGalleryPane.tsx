import { useAttachedAgentChat } from "@tokenring-ai/one-frontend/apps/chat/useAttachedAgentChat.ts";
import { useRouteParamsFor } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import AgentSessionList from "@tokenring-ai/one-frontend/components/AgentSessionList.tsx";
import FilterTabs, { type FilterTabOption } from "@tokenring-ai/one-frontend/components/ui/FilterTabs.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useDebounce } from "@tokenring-ai/one-frontend/hooks/useDebounce.ts";
import { useMemo, useState } from "react";
import GallerySidebar from "../features/media/components/GallerySidebar.tsx";
import type { MediaKind } from "../features/media/types.ts";
import { MEDIA_ITEM_VIEW_ID } from "../ids.ts";
import { MEDIA_UPLOAD_ACCEPT, reindexMediaLibrary, useMediaUpload } from "../lib/mediaActions.tsx";
import { useMediaAgentSession } from "../lib/mediaAgent.tsx";
import { collectKeywords, filterMediaEntries, selectMediaKind, setMediaBrowserState, useMediaBrowserStore, useMediaLibrary } from "../lib/mediaStore.ts";
import { useMediaLayoutNavigation } from "../lib/useMediaLayoutNavigation.ts";

const SEARCH_DEBOUNCE_MS = 300;

/** Agents the Media app can attach to; keeps the chat beside the gallery. */
function MediaAgentSessions() {
  const { agentId, agents, isLoading, selectAgent, createAgent, terminateAgent, TerminateDialog } = useMediaAgentSession();
  useAttachedAgentChat({ agentId });

  return (
    <>
      <AgentSessionList
        agents={agents}
        selectedAgentId={agentId}
        isLoading={isLoading}
        storageKey="media"
        label="Media agents"
        onSelect={selectAgent}
        onCreate={() => void createAgent()}
        onTerminate={id => void terminateAgent(id)}
      />
      <TerminateDialog />
    </>
  );
}

/**
 * The Media app's navigator: kind tabs, search and the gallery grid.
 * Thumbnails open a media tab.
 */
export default function MediaGalleryPane() {
  const selectedFilename = useRouteParamsFor(MEDIA_ITEM_VIEW_ID)?.filename ?? null;

  const { kind, search, keyword } = useMediaBrowserStore();
  const debouncedSearch = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const { entries: libraryEntries, byKind, total, isLoading, error } = useMediaLibrary();
  const { openItem, openGenerate } = useMediaLayoutNavigation();
  // A single upload opens in the main area; several stay in the gallery.
  const upload = useMediaUpload(filenames => {
    if (filenames.length === 1 && filenames[0]) openItem(filenames[0]);
  });
  const [rescanning, setRescanning] = useState(false);

  const entries = useMemo(() => filterMediaEntries(byKind[kind], debouncedSearch, keyword), [byKind, kind, debouncedSearch, keyword]);
  const keywords = useMemo(() => collectKeywords(byKind[kind]), [byKind, kind]);

  // Refresh rescans the folder (keeping every entry's metadata) so files added by hand appear.
  const handleRefresh = () => {
    if (rescanning) return;
    setRescanning(true);
    void reindexMediaLibrary().finally(() => setRescanning(false));
  };

  const tabs: FilterTabOption<MediaKind>[] = [
    { id: "image", label: "Images", count: byKind.image.length },
    { id: "video", label: "Videos", count: byKind.video.length },
    { id: "audio", label: "Audio", count: byKind.audio.length },
  ];

  return (
    <ViewShell tone="sidebar" scroll={false} header={<FilterTabs tabs={tabs} value={kind} onChange={selectMediaKind} showZeroCounts />}>
      <div className="flex-1 min-h-0">
        <GallerySidebar
          kind={kind}
          search={search}
          loading={isLoading || rescanning}
          error={error}
          selectedFilename={selectedFilename}
          entries={entries}
          onSearch={next => setMediaBrowserState({ search: next })}
          onSelect={entry => openItem(entry.filename)}
          onRefresh={handleRefresh}
          onGenerate={() => openGenerate(kind)}
          onUpload={upload.trigger}
          uploading={upload.isUploading}
          keywords={keywords}
          keyword={keyword}
          onKeyword={next => setMediaBrowserState({ keyword: next })}
          windowNote={
            total > libraryEntries.length
              ? `Showing the newest ${libraryEntries.length.toLocaleString()} of ${total.toLocaleString()} files. Older files still open from a direct link.`
              : null
          }
        />
      </div>
      <input
        ref={upload.inputRef}
        type="file"
        multiple
        accept={MEDIA_UPLOAD_ACCEPT}
        onChange={e => void upload.onChange(e)}
        className="hidden"
        data-testid="media-upload-input"
      />

      <div className="shrink-0 border-t border-primary">
        <MediaAgentSessions />
      </div>
    </ViewShell>
  );
}
