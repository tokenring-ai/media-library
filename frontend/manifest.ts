import { Image } from "lucide-react";
import type { PluginAppManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";

/**
 * Metadata for the media app shipped by this plugin. The frontend merges
 * this into its app registry and derives the SPA server routes from it.
 */
export default {
  id: "media",
  path: "/media",
  label: "Media",
  shortLabel: "ME",
  description: "Generate and manage images, audio, and video",
  group: "Build",
  icon: Image,
  iconClass: "text-pink-500",
  gradient: "from-pink-500 to-rose-600",
} satisfies PluginAppManifest;
