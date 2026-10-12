import type { ViewManifest } from "@tokenring-ai/one-frontend/dock/types.ts";
import type { PluginFrontendManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { Image, Images, WandSparkles } from "lucide-react";

export const MEDIA_GALLERY_VIEW = "media-gallery";
export const MEDIA_ITEM_VIEW = "media-item";
export const MEDIA_GENERATE_VIEW = "media-generate";

export const MEDIA_DASHBOARD_ID = "media";

/** Navigator: kind filter, search, the gallery grid and (on the Media dashboard) agent sessions. */
export const mediaGalleryViewManifest = {
  id: MEDIA_GALLERY_VIEW,
  title: "Gallery",
  description: "Browse the media library by kind",
  icon: Images,
  availableOn: ["any"],
  defaultSize: { width: 300, height: 400 },
  minimumSize: { width: 240, height: 160 },
  tags: ["media"],
} satisfies ViewManifest;

/** One media file per panel; without a `filename` it is the "Select a media item" placeholder. */
export const mediaItemViewManifest = {
  id: MEDIA_ITEM_VIEW,
  title: "Media",
  description: "Preview one image, video or audio clip",
  icon: Image,
  availableOn: [],
  instanceable: true,
  // Playback survives a tab switch.
  renderer: "always",
  minimumSize: { width: 360, height: 240 },
  tags: ["media"],
} satisfies ViewManifest;

/** Generation form, one panel per media kind. */
export const mediaGenerateViewManifest = {
  id: MEDIA_GENERATE_VIEW,
  title: "Generate",
  description: "Generate an image, video or speech clip",
  icon: WandSparkles,
  availableOn: [],
  instanceable: true,
  minimumSize: { width: 360, height: 240 },
  tags: ["media"],
} satisfies ViewManifest;

/** Views that act as the Media dashboard's navigator; media panels never tab into their group. */
export const MEDIA_SIDEBAR_VIEWS: readonly string[] = [MEDIA_GALLERY_VIEW];

/**
 * Metadata for the media dashboard shipped by this plugin. The frontend merges
 * this into its registry and derives the SPA server routes from it.
 */
export default {
  id: MEDIA_DASHBOARD_ID,
  path: "/media",
  label: "Media",
  shortLabel: "ME",
  description: "Generate and manage images, audio, and video",
  group: "Build",
  icon: Image,
  iconClass: "text-pink-500",
  gradient: "from-pink-500 to-rose-600",
  views: [mediaGalleryViewManifest, mediaItemViewManifest, mediaGenerateViewManifest],
} satisfies PluginFrontendManifest;
