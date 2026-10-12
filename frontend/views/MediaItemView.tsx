import CenteredLoadingSpinner from "@tokenring-ai/one-frontend/components/ui/CenteredLoadingSpinner.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import type { ViewPanelHandle, ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { ImageIcon, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { MediaItemParams } from "../app.tsx";
import MediaItemDetails from "../features/media/components/MediaItemDetails.tsx";
import AudioViewer from "../features/media/components/viewers/AudioViewer.tsx";
import ImageViewer from "../features/media/components/viewers/ImageViewer.tsx";
import VideoViewer from "../features/media/components/viewers/VideoViewer.tsx";
import type { MediaEntry } from "../features/media/types.ts";
import { useMediaServeDirectory } from "../features/media/useMediaPaths.ts";
import { useMediaItemActions } from "../lib/mediaActions.tsx";
import { useMediaAgentSession, useMediaNavigation, useSyncMediaSelection, workOnMedia } from "../lib/mediaShared.tsx";
import { markGenerated, setMediaBrowserState, useMediaBrowserStore, useMediaEntry, useRecentlyGenerated } from "../lib/mediaStore.ts";
import { mediaItemPath } from "../lib/paths.ts";

const GENERATE_LABELS: Record<MediaEntry["kind"], string> = { image: "image", video: "video", audio: "speech" };

/** A panel with no entry yet: the main area's placeholder, filled by the next thumbnail clicked. */
function MediaPlaceholder({ panel }: { panel: ViewPanelHandle<MediaItemParams> }) {
  const { kind } = useMediaBrowserStore();
  const { openGenerate } = useMediaNavigation();

  useEffect(() => {
    panel.setTitle("Select media");
  }, [panel]);

  return (
    <EmptyState
      variant="page"
      className="h-full bg-primary"
      icon={ImageIcon}
      iconBadgeClassName="bg-linear-to-br from-pink-500 to-rose-600"
      title="Select a media item"
      hint="Pick an image, video or clip from the gallery to preview it here, or generate a new one."
      ctaLabel={`Generate ${GENERATE_LABELS[kind]}`}
      ctaIcon={WandSparkles}
      onCta={() => openGenerate(kind)}
    />
  );
}

/** The viewer plus the tags / rename / delete bar for one entry. */
function MediaEntryPanel({ entry, panel, viewer }: { entry: MediaEntry; panel: ViewPanelHandle<MediaItemParams>; viewer: React.ReactNode }) {
  const navigate = useNavigate();
  const onDeleted = useCallback(() => panel.close(), [panel]);
  const onRenamed = useCallback(
    (next: string) => {
      // The panel follows the file; the URL follows the active panel.
      panel.updateParams({ filename: next });
      if (panel.isActive) void navigate(mediaItemPath(next), { replace: true });
    },
    [navigate, panel],
  );
  const actions = useMediaItemActions(entry, { onDeleted, onRenamed });
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0">{viewer}</div>
      <MediaItemDetails entry={entry} actions={actions} />
    </div>
  );
}

function MediaItem({ filename, panel }: { filename: string; panel: ViewPanelHandle<MediaItemParams> }) {
  // A file generated moments ago may not be in the library snapshot yet; the
  // hook re-renders when that grace period ends.
  const recentlyGenerated = useRecentlyGenerated(filename, true);
  const lookup = useMediaEntry(filename, { waitForStream: recentlyGenerated });
  const entry = lookup.entry;
  const { agentId, ensureAgent } = useMediaAgentSession();
  const { openAgentChat, openItem } = useMediaNavigation();
  const serveDirectory = useMediaServeDirectory();
  const { busy: workingOn, execute: executeWorkOn } = useBusyAction();

  useEffect(() => {
    panel.setTitle(filename);
  }, [filename, panel]);

  // Item panels render "always", so every open one is mounted: only the active
  // panel drives the shared state, and becoming active re-syncs it.
  const isActive = panel.isActive;

  // The gallery follows the panel, so the entry it shows is in the listed kind.
  const kind = entry?.kind;
  useEffect(() => {
    if (isActive && kind) setMediaBrowserState({ kind });
  }, [isActive, kind]);

  // The attached agent's media tools act on whatever the active panel shows.
  useSyncMediaSelection(isActive ? agentId : null, entry);

  const handleWorkOn = async () => {
    if (!entry) return;
    await executeWorkOn(async () => {
      const id = await workOnMedia(ensureAgent, entry, serveDirectory);
      if (id) openAgentChat(id);
    });
  };

  if (!entry) {
    if (lookup.error) {
      return <ErrorState variant="page" className="bg-primary" title={`Could not load '${filename}'`} error={lookup.error} onRetry={lookup.retry} />;
    }
    if (lookup.loading) return <CenteredLoadingSpinner fill />;
    return (
      <EmptyState
        variant="page"
        className="h-full bg-primary"
        icon={ImageIcon}
        title="Media not found"
        hint={`'${filename}' is no longer in the library. Pick another item from the gallery.`}
        ctaLabel="Close panel"
        ctaIcon={X}
        onCta={() => panel.close()}
      />
    );
  }

  const close = () => panel.close();
  const openVariation = (created: string) => {
    markGenerated(created);
    openItem(created);
  };

  let viewer: React.ReactNode;
  switch (entry.kind) {
    case "image":
      viewer = (
        <ImageViewer
          image={entry}
          workingOn={workingOn}
          onWorkOnImage={handleWorkOn}
          onClose={close}
          ensureAgent={ensureAgent}
          onVariationCreated={openVariation}
        />
      );
      break;
    case "video":
      viewer = <VideoViewer video={entry} workingOn={workingOn} onWorkOnVideo={handleWorkOn} onClose={close} />;
      break;
    case "audio":
      viewer = <AudioViewer audio={entry} ensureAgent={ensureAgent} workingOn={workingOn} onWorkOnAudio={handleWorkOn} onClose={close} />;
      break;
    default: {
      const exhaustive: never = entry;
      return exhaustive;
    }
  }
  return <MediaEntryPanel entry={entry} panel={panel} viewer={viewer} />;
}

/** One media file per panel; without a `filename` it is the gallery's placeholder. */
export default function MediaItemView({ params, panel }: ViewProps<MediaItemParams>) {
  if (!params.filename) return <MediaPlaceholder panel={panel} />;
  return <MediaItem key={params.filename} filename={params.filename} panel={panel} />;
}
