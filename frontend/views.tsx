import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Image, Images, WandSparkles } from "lucide-react";
import { lazy } from "react";
import { mediaUrl } from "./features/media/utils.ts";
import { MEDIA_GALLERY_VIEW_ID, MEDIA_GENERATE_VIEW_ID, MEDIA_ITEM_VIEW_ID, MEDIA_START_VIEW_ID, MEDIA_VIEW_KIND } from "./ids.ts";

const MediaGalleryPane = lazy(() => import("./panes/MediaGalleryPane.tsx"));
const MediaStartPane = lazy(() => import("./panes/MediaStartPane.tsx"));
const MediaItemPane = lazy(() => import("./panes/MediaItemPane.tsx"));
const MediaGeneratePane = lazy(() => import("./panes/MediaGeneratePane.tsx"));

const GENERATE_TITLES: Record<string, string> = {
  image: "Generate image",
  video: "Generate video",
  audio: "Generate speech",
};

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif)$/i;

export default {
  views: [
    // Navigator: kind filter, search, the gallery grid and the attached agent's sessions.
    defineView({
      id: MEDIA_GALLERY_VIEW_ID,
      kind: "navigator",
      title: "Gallery",
      description: "Browse the media library by kind",
      icon: Images,
      closable: false,
      component: MediaGalleryPane,
    }),
    // `/media`: the "Select a media item" placeholder; closes once a file is opened.
    defineView({
      id: MEDIA_START_VIEW_ID,
      landing: true,
      kind: MEDIA_VIEW_KIND,
      title: "Select media",
      description: "Pick an item from the gallery, or generate a new one",
      icon: Image,
      route: "",
      component: MediaStartPane,
    }),
    // One media file per tab (`/media/<filename>`); playback survives a tab switch.
    defineView({
      id: MEDIA_ITEM_VIEW_ID,
      kind: MEDIA_VIEW_KIND,
      title: params => params.filename ?? "Media",
      description: "Preview one image, video or audio clip",
      icon: Image,
      route: ":filename",
      instanceKey: params => params.filename ?? "",
      // Carousel strip: only images have a picture to show.
      thumbnail: params => (params.filename && IMAGE_EXTENSION.test(params.filename) ? mediaUrl(params.filename) : undefined),
      component: MediaItemPane,
    }),
    // Generation form, one tab per media kind. The URL owns focus, so it needs a route of its own
    // (`/media/generate/image`); the old dashboard kept this panel off the URL.
    defineView({
      id: MEDIA_GENERATE_VIEW_ID,
      kind: MEDIA_VIEW_KIND,
      title: params => GENERATE_TITLES[params.kind ?? ""] ?? "Generate",
      description: "Generate an image, video or speech clip",
      icon: WandSparkles,
      route: "generate/:kind",
      instanceKey: params => params.kind ?? "",
      component: MediaGeneratePane,
    }),
  ],
} satisfies PluginLayoutViews;
