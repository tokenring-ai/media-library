import { BeforeInputReceived } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { HookSubscription } from "@tokenring-ai/lifecycle/types";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";
import { MediaLibraryState } from "../state/MediaLibraryState.ts";

const name = "addSelectedMedia";
const displayName = "Media Library/Tag currently selected media in chat";
const description = "Tags the currently selected media library item by filename only (does not attach the media file)";

async function addSelectedMedia(data: BeforeInputReceived, agent: Agent) {
  const attachments = (data.input.attachments ??= []);
  agent.mutateState(MediaLibraryState, state => {
    if (!state.selectedFilename) return;
    if (state.lastAttachedFilename === state.selectedFilename) return;

    const kindLabel = state.selectedKind ? `${state.selectedKind} ` : "";
    attachments.push({
      name: state.selectedFilename,
      description: `The currently selected ${kindLabel}media library item (filename only; the media file itself is not attached).`,
      encoding: "text",
      mimeType: "text/plain",
      body: state.selectedFilename,
    });
    // Only mark as attached after the attachment was successfully pushed.
    state.lastAttachedFilename = state.selectedFilename;
  });
}

const callbacks = [new HookCallback(BeforeInputReceived, addSelectedMedia)];

export default {
  name,
  displayName,
  description,
  callbacks,
} satisfies HookSubscription;
