import type { ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useEffect } from "react";
import type { MediaGenerateParams } from "../app.tsx";
import ImageGeneratePanel from "../features/media/components/generate/ImageGeneratePanel.tsx";
import SpeechGeneratePanel from "../features/media/components/generate/SpeechGeneratePanel.tsx";
import VideoGeneratePanel from "../features/media/components/generate/VideoGeneratePanel.tsx";
import { useMediaAgentSession, useMediaNavigation } from "../lib/mediaShared.tsx";
import { markGenerated, refreshMediaLibrary, setMediaBrowserState } from "../lib/mediaStore.ts";

const TITLES: Record<MediaGenerateParams["kind"], string> = {
  image: "Generate image",
  video: "Generate video",
  audio: "Generate speech",
};

/** The generation form for one media kind; the new file opens in its own panel. */
export default function MediaGenerateView({ params, panel }: ViewProps<MediaGenerateParams>) {
  const { kind } = params;
  const { ensureAgent } = useMediaAgentSession();
  const { openItem } = useMediaNavigation();

  useEffect(() => {
    panel.setTitle(TITLES[kind]);
  }, [kind, panel]);

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
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
