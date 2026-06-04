import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { WebHostService } from "@tokenring-ai/web-host";
import type { BunRouter } from "@tokenring-ai/web-host/types";
import { z } from "zod";
import agentCommands from "./commands.ts";
import MediaLibraryService from "./MediaLibraryService.ts";
import packageJSON from "./package.json" with { type: "json" };
import { MediaLibraryServiceConfigSchema } from "./schema.ts";
import tools from "./tools.ts";

const packageConfigSchema = z.object({
  mediaLibrary: MediaLibraryServiceConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Media Library",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    const mediaLibrary = new MediaLibraryService(config.mediaLibrary);
    app.addServices(mediaLibrary);
    app.waitForService(ChatService, chatService => chatService.addTools(...tools));
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource("Media Library Files", {
        register(router: BunRouter) {
          router.static(mediaLibrary.getStaticPath(), mediaLibrary.getDefaultOutputDirectory());
          return Promise.resolve();
        },
      });
    });
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
