import manifest from "./manifest.ts";
import MediaApp from "./MediaApp.tsx";
import type { PluginAppDefinition } from "@tokenring-ai/one-frontend/plugins/types.ts";

/**
 * The media app contributed to the TokenRing One frontend by this
 * plugin. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  routePath: "/media",
  component: MediaApp,
} satisfies PluginAppDefinition;
