import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import type { PluginFrontendContribution } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { lazy } from "react";
import { z } from "zod";
import { MEDIA_GENERATE_PARAM, MEDIA_PATH, mediaItemPath } from "./lib/paths.ts";
import manifest, {
  MEDIA_GENERATE_VIEW,
  MEDIA_ITEM_VIEW,
  MEDIA_SIDEBAR_VIEWS,
  mediaGalleryViewManifest,
  mediaGenerateViewManifest,
  mediaItemViewManifest,
} from "./manifest.ts";

export const MediaItemParams = z.object({
  /** Omitted for the placeholder panel that the next opened entry fills. */
  filename: z.string().min(1).optional(),
});
export type MediaItemParams = z.infer<typeof MediaItemParams>;

export const MediaGenerateParams = z.object({ kind: z.enum(["image", "video", "audio"]) });
export type MediaGenerateParams = z.infer<typeof MediaGenerateParams>;

const GENERATE_TITLES: Record<MediaGenerateParams["kind"], string> = {
  image: "Generate image",
  video: "Generate video",
  audio: "Generate speech",
};

/**
 * The Media dashboard: the gallery beside one panel per open media file.
 * `/media/<filename>` opens (or focuses) that entry and the active panel keeps
 * the URL in step. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  views: [
    { ...mediaGalleryViewManifest, component: lazy(() => import("./views/MediaGalleryView.tsx")) },
    {
      ...mediaItemViewManifest,
      params: MediaItemParams,
      instanceKey: params => params.filename ?? "new",
      titleFor: params => params.filename ?? "Select media",
      component: lazy(() => import("./views/MediaItemView.tsx")),
    },
    {
      ...mediaGenerateViewManifest,
      params: MediaGenerateParams,
      instanceKey: (params: MediaGenerateParams) => params.kind,
      titleFor: (params: MediaGenerateParams) => GENERATE_TITLES[params.kind],
      component: lazy(() => import("./views/MediaGenerateView.tsx")),
    },
  ],
  dashboards: [
    {
      ...manifest,
      routePath: `${MEDIA_PATH}/:filename?`,
      defaultLayout: {
        kind: "row",
        sizes: [1, 3],
        children: [
          { kind: "panel", view: mediaGalleryViewManifest.id },
          { kind: "panel", view: mediaItemViewManifest.id },
        ],
      },
      onNavigate({ params, searchParams }, api) {
        const filename = params.filename;
        if (filename) openInMainArea(api, MEDIA_ITEM_VIEW, { filename }, { sidebarViews: MEDIA_SIDEBAR_VIEWS, fillPlaceholder: true });
        // `?generate=<kind>` (from "Generate" off this dashboard) opens that kind's form.
        const generate = MediaGenerateParams.safeParse({ kind: searchParams.get(MEDIA_GENERATE_PARAM) });
        if (generate.success) openInMainArea(api, MEDIA_GENERATE_VIEW, generate.data, { sidebarViews: MEDIA_SIDEBAR_VIEWS });
      },
      pathForActivePanel(panel) {
        if (panel?.viewId !== MEDIA_ITEM_VIEW) return null;
        // The placeholder leaves the URL pointing at the last entry.
        return typeof panel.params.filename === "string" ? mediaItemPath(panel.params.filename) : null;
      },
      documentTitle: ({ params }) => (params.filename ? `${params.filename} · Media` : "Media"),
    },
  ],
} satisfies PluginFrontendContribution;
