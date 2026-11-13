import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import { ImageIcon, WandSparkles } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { MediaKind } from "../features/media/types.ts";
import { MEDIA_GENERATE_PARAM } from "../ids.ts";
import { useMediaBrowserStore } from "../lib/mediaStore.ts";
import { useMediaLayoutNavigation } from "../lib/useMediaLayoutNavigation.ts";

const GENERATE_LABELS: Record<MediaKind, string> = { image: "image", video: "video", audio: "speech" };

function parseKind(value: string | null): MediaKind | null {
  return value === "image" || value === "video" || value === "audio" ? value : null;
}

/** `/media`: the "Select a media item" placeholder; `?generate=<kind>` also opens that kind's form. */
export default function MediaStartPane() {
  const { kind } = useMediaBrowserStore();
  const { openGenerate } = useMediaLayoutNavigation();
  const [search] = useSearchParams();
  const requested = parseKind(search.get(MEDIA_GENERATE_PARAM));

  // Deliberately keyed on the requested kind only: open once per arrival.
  useEffect(() => {
    if (requested) openGenerate(requested);
  }, [requested]);

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
