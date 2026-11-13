import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import ImageGeneratePanel from "../features/media/components/generate/ImageGeneratePanel.tsx";
import SpeechGeneratePanel from "../features/media/components/generate/SpeechGeneratePanel.tsx";
import VideoGeneratePanel from "../features/media/components/generate/VideoGeneratePanel.tsx";
import type { MediaKind } from "../features/media/types.ts";
import { useMediaAgentSession } from "../lib/mediaAgent.tsx";
import { markGenerated, refreshMediaLibrary, setMediaBrowserState } from "../lib/mediaStore.ts";
import { useMediaLayoutNavigation } from "../lib/useMediaLayoutNavigation.ts";

/** The generation form for one media kind; the new file opens in its own tab. */
export default function MediaGeneratePane({ params }: ViewProps) {
  const kind: MediaKind = params.kind === "video" || params.kind === "audio" ? params.kind : "image";
  const { ensureAgent } = useMediaAgentSession();
  const { openItem } = useMediaLayoutNavigation();

  const handleGenerated = (filename?: string) => {
    // Clear the search so the new file is not filtered out of the gallery.
    setMediaBrowserState({ kind, search: "" });
    refreshMediaLibrary();
    if (!filename) return;
    markGenerated(filename);
    openItem(filename);
  };

  switch (kind) {
    case "image":
      return <ImageGeneratePanel ensureAgent={ensureAgent} onGenerated={handleGenerated} />;
    case "video":
      return <VideoGeneratePanel ensureAgent={ensureAgent} onGenerated={handleGenerated} />;
    case "audio":
      return <SpeechGeneratePanel ensureAgent={ensureAgent} onGenerated={handleGenerated} />;
  }
}
