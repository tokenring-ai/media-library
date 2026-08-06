import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import { RpcService } from "@tokenring-ai/rpc";
import { StaticResource, WebHostService } from "@tokenring-ai/web-host";
import { z } from "zod";
import agentCommands from "./commands.ts";
import config from "./config/index.ts";
import addSelectedMedia from "./hooks/addSelectedMedia.ts";
import MediaLibraryService from "./MediaLibraryService.ts";
import packageJSON from "./package.json" with { type: "json" };
import mediaLibraryRPC from "./rpc/mediaLibrary.ts";
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
  config,
  install(app) {
    const mediaLibrary = app.addService(new MediaLibraryService());

    app.waitForService(AgentLifecycleService, lifecycleService => lifecycleService.addHooks(addSelectedMedia));
    app.waitForService(ChatService, chatService => chatService.addTools(tools));
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(mediaLibraryRPC);
    });
    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource(
        "Media Library Files",
        new StaticResource({
          root: mediaLibrary.getDefaultOutputDirectory(),
          prefix: mediaLibrary.getStaticPath(),
        }),
      );
    });
  },
  reconfigure(app, config) {
    app.requireService(MediaLibraryService).reconfigure(config.mediaLibrary);
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
