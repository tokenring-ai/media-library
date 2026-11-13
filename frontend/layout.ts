import type { AppManifest } from "@tokenring-ai/one-frontend/layout/types.ts";
import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Image } from "lucide-react";
import {
  MEDIA_APP_ID,
  MEDIA_APP_PATH,
  MEDIA_GALLERY_VIEW_ID,
  MEDIA_GENERATE_VIEW_ID,
  MEDIA_ITEM_VIEW_ID,
  MEDIA_START_VIEW_ID,
  MEDIA_VIEW_KIND,
} from "./ids.ts";

/**
 * Media: the gallery (with the attached media agent) on the left, one tab per
 * open file or generation form on the right, and the agent's chat beside them.
 * Routes: `/media` (the "Select a media item" start tab, which also honours
 * `?generate=<kind>`) and `/media/<filename>`,
 * `/media/generate/<kind>` (the generation forms).
 */
export const MEDIA_LIBRARY_APP: AppManifest = {
  id: MEDIA_APP_ID,
  path: MEDIA_APP_PATH,
  label: "Media",
  shortLabel: "ME",
  description: "Generate and manage images, audio, and video",
  group: "Build",
  icon: Image,
  iconClass: "text-pink-500",
  gradient: "from-pink-500 to-rose-600",
  views: [MEDIA_GALLERY_VIEW_ID, MEDIA_START_VIEW_ID, MEDIA_ITEM_VIEW_ID, MEDIA_GENERATE_VIEW_ID, "chat"],
  primaryKind: MEDIA_VIEW_KIND,
  placement: { agent: "right" },
  layout: {
    split: "row",
    sizes: [1, 3],
    children: [
      { presenter: "single", accepts: ["navigator"], items: [MEDIA_GALLERY_VIEW_ID] },
      { presenter: "tabs", accepts: [MEDIA_VIEW_KIND], items: [MEDIA_START_VIEW_ID], primary: true },
    ],
  },
};

export default {
  apps: [MEDIA_LIBRARY_APP],
  kinds: [{ id: MEDIA_VIEW_KIND, label: "Media", plural: "media tabs" }],
} satisfies PluginLayoutManifest;
