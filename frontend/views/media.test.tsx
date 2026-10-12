import { beforeEach, describe, expect, it, mock } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ViewDefinition, ViewParams } from "@tokenring-ai/one-frontend/dock/types.ts";
import { createFakeDashboardApi, createFakePanelHandle, type FakeDashboardApi, renderView } from "@tokenring-ai/one-frontend/test/dock.tsx";
import type React from "react";
import { Route, useLocation } from "react-router-dom";
import type { MediaGenerateParams, MediaItemParams } from "../app.tsx";

const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

const panda = {
  kind: "image" as const,
  filename: "panda.png",
  mimeType: "image/png",
  keywords: ["panda", "cute"],
  prompt: "a red panda",
  width: 512,
  height: 512,
};
const drone = {
  kind: "video" as const,
  filename: "drone.mp4",
  mimeType: "video/mp4",
  keywords: ["forest"],
  width: 1920,
  height: 1080,
  duration: 12,
};
const greeting = {
  kind: "audio" as const,
  filename: "hello.mp3",
  mimeType: "audio/mpeg",
  keywords: ["greeting"],
  duration: 3,
  sampleRate: 44_100,
  channels: 2,
};

const mediaAgent = {
  id: "agent-1",
  createdAt: 1_700_000_000_000,
  agentType: "media",
  displayName: "Media Agent",
  description: "",
  idle: true,
  currentActivity: "",
};

type Entry = typeof panda | typeof drone | typeof greeting;

const state = {
  entries: [] as Entry[],
  loaded: true,
  agents: [] as (typeof mediaAgent)[],
  /** Library size reported by the stream; defaults to the streamed entries. */
  count: undefined as number | undefined,
  streamError: undefined as Error | undefined,
  imageModels: { "dall-e-3": { available: true } } as Record<string, { available: boolean }>,
};

const updateMediaLibraryState = mock(async (_args: Record<string, unknown>) => ({
  status: "success" as const,
  selectedFilename: null,
  selectedKind: null,
}));
const createAgent = mock(async (_args: { agentType: string; headless: boolean }) => ({ id: "agent-new", displayName: "Media Agent", description: "" }));
const deleteAgent = mock(async (_args: { agentId: string; reason: string }) => ({ status: "success" as const }));
const sendInput = mock(async (_args: Record<string, unknown>) => ({ status: "success" as const, requestId: "req-1" }));
const generateImage = mock(async (_args: Record<string, unknown>) => ({ status: "success" as const, results: [{ fileName: "cat.png" }] }));
const generateVideo = mock(async (_args: Record<string, unknown>) => ({ status: "success" as const, filename: "clip.mp4" }));
const generateSpeech = mock(async (_args: Record<string, unknown>) => ({ status: "success" as const, filename: "speech.mp3" }));
const transcribeAudio = mock(async (_args: { agentId: string; filename: string }) => ({ status: "success" as const, text: "hello there" }));
const mutateMedia = mock(async () => undefined);
const getMedia = mock(async (_args: { search?: string; limit?: number }) => ({ media: [] as Entry[], count: 0 }));
const reindexMedia = mock(async (_args: Record<string, never>) => ({ total: 4, added: 1, removed: 0, kept: 3 }));
const deleteMedia = mock(async (_args: { filename: string }) => ({ success: true, clearedSelections: 0 }));
const renameMedia = mock(async (args: { filename: string; newFilename: string }) => ({ entry: { ...panda, filename: args.newFilename } }));
const updateMediaKeywords = mock(async (args: { filename: string; keywords: string[] }) => ({ entry: { ...panda, keywords: args.keywords } }));
const importMedia = mock(async (args: { filename: string; contentBase64: string; overwrite: boolean }) => ({ entry: { ...panda, filename: args.filename } }));
const mediaFileExists = mock(async (_args: { filename: string }) => ({ exists: false }));
const adjustImage = mock(async (_args: Record<string, unknown>) => ({
  status: "success" as const,
  fileName: "panda-small.png",
  width: 256,
  height: 256,
  mediaType: "image/png",
}));

void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  useMedia: () => ({
    data: state.loaded ? { media: state.entries, count: state.count ?? state.entries.length } : undefined,
    isLoading: !state.loaded && !state.streamError,
    error: state.streamError,
    mutate: mutateMedia,
  }),
  useMediaLibraryConfiguration: () => ({
    data: { agentTypes: ["media"], outputDirectory: "media-library", serveDirectory: ".tokenring/media-library" },
    isLoading: false,
    error: undefined,
    mutate: mock(async () => undefined),
  }),
  mediaLibraryRPCClient: { updateMediaLibraryState, getMedia, reindexMedia, deleteMedia, renameMedia, updateMediaKeywords, importMedia, mediaFileExists },
  useAgentList: () => ({ data: state.agents, isLoading: false, error: undefined, mutate: mock(async () => undefined) }),
  useAgentTypes: () => ({ data: [{ type: "media", displayName: "Media Agent", description: "", enabledTools: [] }], isLoading: false }),
  agentRPCClient: { createAgent, deleteAgent, sendInput },
  imageGenerationRPCClient: { generateImage, adjustImage },
  videoGenerationRPCClient: { generateVideo },
  audioRPCClient: { generateSpeech, transcribeAudio },
  useImageGenerationModels: () => ({ data: { models: state.imageModels }, isLoading: false }),
  useVideoGenerationModels: () => ({ data: { models: { sora: { available: true } } }, isLoading: false }),
  useSpeechModels: () => ({ data: { models: { tts: { available: true } } }, isLoading: false }),
}));

const { default: contribution } = await import("../app.tsx");
const { resetMediaBrowserStore, getMediaBrowserStateForTest, GENERATED_GRACE_MS, markGenerated } = await import("../lib/mediaStore.ts");
const { resetSyncedMediaSelection } = await import("../lib/mediaShared.tsx");

function SearchProbe() {
  const location = useLocation();
  return <span data-testid="landing">{`${location.pathname}${location.search}`}</span>;
}

const ROUTES = ["/media/:filename?"];
const getView = (id: string) => contribution.views.find(view => view.id === id);
const viewById = (id: string) => getView(id) as ViewDefinition<any>;
const dashboard = contribution.dashboards[0]!;

function fakeApi(dashboardId = "media"): FakeDashboardApi {
  return createFakeDashboardApi({ dashboardId, getView });
}

/** The union of params the media views accept; `kind` is optional here because only the generate view takes it. */
type MediaViewParams = MediaItemParams & Partial<MediaGenerateParams>;

function renderMediaView(viewId: string, params: MediaViewParams = {}, path = "/media", api = fakeApi()) {
  const panel = createFakePanelHandle({
    viewId,
    dashboardId: api.dashboardId,
    panelId: `${viewId}:${params.filename ?? params.kind ?? "new"}`,
    params,
  });
  return renderView(viewById(viewId), params, { api, panel, path, routes: api.dashboardId === "media" ? ROUTES : ["*"] });
}

const pathname = () => screen.getByTestId("pathname").textContent;

describe("Media dashboard views", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMediaBrowserStore();
    for (const fn of [
      updateMediaLibraryState,
      createAgent,
      deleteAgent,
      sendInput,
      generateImage,
      generateVideo,
      generateSpeech,
      transcribeAudio,
      mutateMedia,
      getMedia,
      reindexMedia,
      deleteMedia,
      renameMedia,
      updateMediaKeywords,
      importMedia,
      mediaFileExists,
      adjustImage,
    ]) {
      fn.mockClear();
    }
    state.entries = [panda, drone, greeting];
    state.loaded = true;
    state.agents = [];
    state.count = undefined;
    state.streamError = undefined;
    state.imageModels = { "dall-e-3": { available: true } };
    resetSyncedMediaSelection();
  });

  describe("gallery (navigator)", () => {
    it("lists the active kind with per-kind counts and opens an entry in the main area", async () => {
      const user = userEvent.setup();
      const { api } = renderMediaView("media-gallery");

      expect(await screen.findByRole("button", { name: "Open panda.png" })).toBeInTheDocument();
      // Only the active kind is listed; the tabs still count the rest.
      expect(screen.queryByRole("button", { name: "Open drone.mp4" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Videos/ })).toHaveTextContent("1");

      await user.click(screen.getByRole("button", { name: "Open panda.png" }));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "media-item", params: { filename: "panda.png" } })]);
      expect(pathname()).toBe("/media/panda.png");
    });

    it("highlights the entry named by the URL", async () => {
      renderMediaView("media-gallery", {}, "/media/panda.png");
      expect(await screen.findByRole("button", { name: "Open panda.png" })).toHaveAttribute("aria-current", "true");
    });

    it("switches kinds and filters the listed entries by search", async () => {
      const user = userEvent.setup();
      renderMediaView("media-gallery");

      await user.click(await screen.findByRole("button", { name: /Audio/ }));
      expect(await screen.findByRole("button", { name: "Open hello.mp3" })).toBeInTheDocument();

      await user.type(screen.getByLabelText("Search audio"), "nothing");
      expect(await screen.findByText('No audio matching "nothing"')).toBeInTheDocument();
    });

    it("opens the generation panel for the listed kind", async () => {
      const user = userEvent.setup();
      const { api } = renderMediaView("media-gallery");

      await user.click(await screen.findByRole("button", { name: "Generate image" }));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "media-generate", params: { kind: "image" } })]);
    });

    it("lists media agents on the Media dashboard and docks a chat for the attached one", async () => {
      state.agents = [mediaAgent];
      const { api } = renderMediaView("media-gallery");

      expect(await screen.findByText("Media Agent")).toBeInTheDocument();
      await waitFor(() => expect(api.opened.some(open => open.viewId === "chat" && open.params.agentId === "agent-1")).toBe(true));
    });

    it("says when the library holds more files than the gallery shows", async () => {
      state.count = 1234;
      renderMediaView("media-gallery");
      expect(await screen.findByTestId("media-window-note")).toHaveTextContent("Showing the newest 3 of 1,234 files");
    });

    it("has no window note when every file is shown", async () => {
      renderMediaView("media-gallery");
      await screen.findByRole("button", { name: "Open panda.png" });
      expect(screen.queryByTestId("media-window-note")).not.toBeInTheDocument();
    });

    it("Refresh rescans the media folder before reloading the gallery", async () => {
      const user = userEvent.setup();
      renderMediaView("media-gallery");

      await user.click((await screen.findAllByRole("button", { name: "Refresh gallery" }))[0]!);
      await waitFor(() => expect(reindexMedia).toHaveBeenCalledWith({}));
      await waitFor(() => expect(mutateMedia).toHaveBeenCalled());
    });

    it("filters the gallery by tag", async () => {
      const user = userEvent.setup();
      const otter = { ...panda, filename: "otter.png", keywords: ["otter"] };
      state.entries = [panda, otter, drone, greeting];
      renderMediaView("media-gallery");

      expect(await screen.findByRole("button", { name: "Open otter.png" })).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Filter by tag"), "otter");
      await waitFor(() => expect(screen.queryByRole("button", { name: "Open panda.png" })).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Open otter.png" })).toBeInTheDocument();
      // Switching kinds clears the tag filter.
      await user.click(screen.getByRole("button", { name: /Videos/ }));
      expect(getMediaBrowserStateForTest().keyword).toBeNull();
    });

    it("uploads files into the library and opens a single upload", async () => {
      const user = userEvent.setup();
      const { api } = renderMediaView("media-gallery");
      await screen.findByRole("button", { name: "Open panda.png" });

      await user.upload(screen.getByTestId("media-upload-input"), new File(["png-bytes"], "new.png", { type: "image/png" }));

      await waitFor(() => expect(importMedia).toHaveBeenCalledWith(expect.objectContaining({ filename: "new.png", overwrite: true })));
      expect(mediaFileExists).toHaveBeenCalledWith({ filename: "new.png" });
      await waitFor(() => expect(api.opened).toEqual([expect.objectContaining({ viewId: "media-item", params: { filename: "new.png" } })]));
    });

    it("only navigates when shown outside the Media dashboard", async () => {
      const user = userEvent.setup();
      state.agents = [mediaAgent];
      const api = fakeApi("home");
      renderMediaView("media-gallery", {}, "/", api);

      await user.click(await screen.findByRole("button", { name: "Open panda.png" }));
      expect(api.opened).toHaveLength(0);
      expect(pathname()).toBe("/media/panda.png");
      expect(screen.queryByText("Media agents")).not.toBeInTheDocument();
    });
  });

  describe("media panel", () => {
    it("shows the placeholder until an entry is opened", async () => {
      const user = userEvent.setup();
      const { api, panel } = renderMediaView("media-item");

      expect(await screen.findByText("Select a media item")).toBeInTheDocument();
      await waitFor(() => expect(panel.title).toBe("Select media"));

      await user.click(screen.getByRole("button", { name: "Generate image" }));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "media-generate", params: { kind: "image" } })]);
    });

    it("previews an image, names its tab and tells the attached agent what is on screen", async () => {
      state.agents = [mediaAgent];
      const { panel } = renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      expect(await screen.findByText("512×512 · Square")).toBeInTheDocument();
      await waitFor(() => expect(panel.title).toBe("panda.png"));
      await waitFor(() => expect(updateMediaLibraryState).toHaveBeenCalledWith({ agentId: "agent-1", selectedFilename: "panda.png", selectedKind: "image" }));
    });

    it("hands the entry to an agent, starting one when none is attached, and opens its chat", async () => {
      const user = userEvent.setup();
      const { api } = renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      await user.click(await screen.findByRole("button", { name: /Work on this image/ }));

      await waitFor(() => expect(createAgent).toHaveBeenCalledWith({ agentType: "media", headless: false }));
      await waitFor(() => expect(sendInput).toHaveBeenCalled());
      const message = (sendInput.mock.calls[0]![0] as { input: { message: string } }).input.message;
      expect(message).toContain("panda.png");
      expect(message).toContain("/api/fs/posix/.tokenring/media-library/panda.png");
      await waitFor(() => expect(api.opened).toEqual([expect.objectContaining({ viewId: "chat", params: { agentId: "agent-new" } })]));
    });

    it("transcribes an audio clip through the media agent", async () => {
      const user = userEvent.setup();
      state.agents = [mediaAgent];
      renderMediaView("media-item", { filename: "hello.mp3" }, "/media/hello.mp3");

      await user.click(await screen.findByRole("button", { name: /Transcribe/ }));
      await waitFor(() => expect(transcribeAudio).toHaveBeenCalledWith({ agentId: "agent-1", filename: "hello.mp3" }));
      expect(await screen.findByText("hello there")).toBeInTheDocument();
    });

    it("offers to close the panel when the entry is gone", async () => {
      const user = userEvent.setup();
      const { panel } = renderMediaView("media-item", { filename: "ghost.png" }, "/media/ghost.png");

      expect(await screen.findByText("Media not found")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close panel" }));
      expect(panel.closed).toBe(true);
    });

    it("fetches a deep-linked file that is outside the streamed window", async () => {
      const old = { ...panda, filename: "old-otter.png", prompt: "an otter" };
      getMedia.mockImplementationOnce(async () => ({ media: [old], count: 1 }));
      renderMediaView("media-item", { filename: "old-otter.png" }, "/media/old-otter.png");

      expect(await screen.findByRole("button", { name: /Work on this image/ })).toBeInTheDocument();
      expect(getMedia).toHaveBeenCalledWith({ search: "old-otter.png", limit: 200 });
      expect(screen.queryByText("Media not found")).not.toBeInTheDocument();
    });

    it("ignores lookup results that only partially match the file name", async () => {
      getMedia.mockImplementationOnce(async () => ({ media: [{ ...panda, filename: "ghost.png.bak" }], count: 1 }));
      renderMediaView("media-item", { filename: "ghost.png" }, "/media/ghost.png");
      expect(await screen.findByText("Media not found")).toBeInTheDocument();
    });

    it("shows an error with retry when the library cannot load", async () => {
      const user = userEvent.setup();
      state.loaded = false;
      state.streamError = new Error("socket closed");
      renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      expect(await screen.findByText("Could not load 'panda.png'")).toBeInTheDocument();
      expect(screen.getByText("socket closed")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(mutateMedia).toHaveBeenCalled();
    });

    it("shows an error with retry when looking the file up fails", async () => {
      const user = userEvent.setup();
      getMedia.mockImplementationOnce(async () => {
        throw new Error("lookup failed");
      });
      renderMediaView("media-item", { filename: "old.png" }, "/media/old.png");

      expect(await screen.findByText("lookup failed")).toBeInTheDocument();
      getMedia.mockImplementationOnce(async () => ({ media: [{ ...panda, filename: "old.png" }], count: 1 }));
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByRole("button", { name: /Work on this image/ })).toBeInTheDocument();
    });

    it("deletes an entry after confirmation and closes its panel", async () => {
      const user = userEvent.setup();
      const { panel } = renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      await user.click(await screen.findByRole("button", { name: "Delete" }));
      expect(await screen.findByText(/Delete “panda.png” from the media library/)).toBeInTheDocument();
      expect(deleteMedia).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteMedia).toHaveBeenCalledWith({ filename: "panda.png" }));
      await waitFor(() => expect(panel.closed).toBe(true));
    });

    it("renames an entry and points the panel at the new name", async () => {
      const user = userEvent.setup();
      const { panel } = renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      await user.click(await screen.findByRole("button", { name: "Rename" }));
      const input = screen.getByLabelText("New file name");
      await user.clear(input);
      await user.type(input, "red-panda.mp4");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rename" }));
      expect(await screen.findByText(/Keep a image extension/)).toBeInTheDocument();
      expect(renameMedia).not.toHaveBeenCalled();

      await user.clear(input);
      await user.type(input, "red-panda.png");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rename" }));

      await waitFor(() => expect(renameMedia).toHaveBeenCalledWith({ filename: "panda.png", newFilename: "red-panda.png" }));
      await waitFor(() => expect(panel.params).toEqual({ filename: "red-panda.png" }));
    });

    it("adds and removes tags", async () => {
      const user = userEvent.setup();
      renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      await user.type(await screen.findByLabelText("Add tags"), "zoo, Panda{Enter}");
      await waitFor(() => expect(updateMediaKeywords).toHaveBeenCalledWith({ filename: "panda.png", keywords: ["panda", "cute", "zoo"] }));

      await user.click(screen.getByRole("button", { name: "Remove tag cute" }));
      await waitFor(() => expect(updateMediaKeywords).toHaveBeenLastCalledWith({ filename: "panda.png", keywords: ["panda"] }));
    });

    it("generates a variation from the image's prompt and opens it", async () => {
      const user = userEvent.setup();
      const { api } = renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      await user.click(await screen.findByRole("button", { name: /Edit \/ variation/ }));
      const dialog = screen.getByRole("dialog");
      const prompt = within(dialog).getByLabelText("Prompt");
      expect(prompt).toHaveValue("a red panda");
      await user.type(prompt, " wearing a hat");
      await user.click(within(dialog).getByRole("button", { name: "Generate variation" }));

      await waitFor(() => expect(generateImage).toHaveBeenCalled());
      expect(generateImage.mock.calls[0]![0]).toMatchObject({
        agentId: "agent-new",
        request: { prompt: "a red panda wearing a hat", keywords: ["panda", "cute"], sizing: { method: "guided", shape: "square" } },
      });
      await waitFor(() =>
        expect(api.opened).toEqual(expect.arrayContaining([expect.objectContaining({ viewId: "media-item", params: { filename: "cat.png" } })])),
      );
    });

    it("saves an adjusted copy of the image", async () => {
      const user = userEvent.setup();
      state.agents = [mediaAgent];
      renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");

      await user.click(await screen.findByRole("button", { name: /Edit \/ variation/ }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Adjust" }));
      const save = within(dialog).getByRole("button", { name: "Save adjusted copy" });
      // Nothing to change yet.
      expect(save).toBeDisabled();
      await user.clear(within(dialog).getByLabelText("Scale"));
      await user.type(within(dialog).getByLabelText("Scale"), "0.5");
      await user.selectOptions(within(dialog).getByLabelText("Format"), "webp");
      await user.click(save);

      await waitFor(() => expect(adjustImage).toHaveBeenCalledWith({ agentId: "agent-1", request: { source: "panda.png", format: "webp", scale: 0.5 } }));
    });

    it("shows the image prompt with a copy button", async () => {
      renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");
      const prompt = await screen.findByTestId("media-prompt");
      expect(prompt).toHaveTextContent("a red panda");
      expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
    });

    it("clears the agent's selection when the panel showing it closes", async () => {
      state.agents = [mediaAgent];
      const { unmount } = renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");
      await waitFor(() => expect(updateMediaLibraryState).toHaveBeenCalledWith({ agentId: "agent-1", selectedFilename: "panda.png", selectedKind: "image" }));

      unmount();
      expect(updateMediaLibraryState).toHaveBeenLastCalledWith({ agentId: "agent-1", clearSelection: true });
    });

    it("closing a background panel leaves the active panel's selection alone", async () => {
      state.agents = [mediaAgent];
      const api = fakeApi();
      const background = createFakePanelHandle({
        viewId: "media-item",
        dashboardId: "media",
        panelId: "media-item:drone.mp4",
        params: { filename: "drone.mp4" },
        isActive: false,
      });
      const hidden = renderView(viewById("media-item"), { filename: "drone.mp4" }, { api, panel: background, path: "/media/drone.mp4", routes: ROUTES });
      renderMediaView("media-item", { filename: "panda.png" }, "/media/panda.png");
      await waitFor(() => expect(updateMediaLibraryState).toHaveBeenCalledWith({ agentId: "agent-1", selectedFilename: "panda.png", selectedKind: "image" }));

      hidden.unmount();
      expect(updateMediaLibraryState).not.toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
    });

    it("waits for the library instead of claiming a just-generated file is missing", async () => {
      markGenerated("fresh.png");
      renderMediaView("media-item", { filename: "fresh.png" }, "/media/fresh.png");

      await waitFor(() => expect(screen.queryByText("Media not found")).not.toBeInTheDocument());
    });

    it("shows 'not found' once a just-generated file's grace period runs out", async () => {
      const realNow = Date.now;
      // Generated long enough ago that the grace period ends ~50ms into the test.
      Date.now = () => realNow() - GENERATED_GRACE_MS + 50;
      try {
        markGenerated("late.png");
      } finally {
        Date.now = realNow;
      }
      renderMediaView("media-item", { filename: "late.png" }, "/media/late.png");

      expect(screen.queryByText("Media not found")).not.toBeInTheDocument();
      expect(await screen.findByText("Media not found", {}, { timeout: 2000 })).toBeInTheDocument();
    });

    it("only the active item panel drives the gallery kind and the agent's selection", async () => {
      state.agents = [mediaAgent];
      const api = fakeApi();
      const panel = createFakePanelHandle({
        viewId: "media-item",
        dashboardId: "media",
        panelId: "media-item:drone.mp4",
        params: { filename: "drone.mp4" },
        isActive: false,
      });
      const { rerenderView } = renderView(viewById("media-item"), { filename: "drone.mp4" }, { api, panel, path: "/media/drone.mp4", routes: ROUTES });

      expect(await screen.findByRole("button", { name: /Work on this video/ })).toBeInTheDocument();
      // A mounted but inactive panel (renderer "always") leaves the shared state alone.
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(updateMediaLibraryState).not.toHaveBeenCalled();
      expect(getMediaBrowserStateForTest().kind).toBe("image");

      act(() => panel.setActive(true));
      rerenderView();
      await waitFor(() => expect(updateMediaLibraryState).toHaveBeenCalledWith({ agentId: "agent-1", selectedFilename: "drone.mp4", selectedKind: "video" }));
      expect(getMediaBrowserStateForTest().kind).toBe("video");
    });

    it("off the Media dashboard, 'Generate' lands on a URL that opens the form", async () => {
      const user = userEvent.setup();
      const api = fakeApi("home");
      const panel = createFakePanelHandle({ viewId: "media-item", dashboardId: "home", panelId: "media-item:new", params: {} });
      renderView(viewById("media-item"), {}, { api, panel, path: "/", routes: ["/"], extraRoutes: <Route path="/media" element={<SearchProbe />} /> });

      await user.click(await screen.findByRole("button", { name: "Generate image" }));
      expect(api.opened).toHaveLength(0);
      expect(await screen.findByTestId("landing")).toHaveTextContent("/media?generate=image");

      // ...and the Media dashboard's onNavigate opens the form for that URL.
      const mediaApi = fakeApi();
      mediaApi.panels.push({ panelId: "media-gallery", viewId: "media-gallery", params: {}, title: "Gallery" });
      dashboard.onNavigate?.({ pathname: "/media", params: {}, searchParams: new URLSearchParams("generate=image") }, mediaApi);
      expect(mediaApi.opened.map(open => [open.viewId, open.params])).toEqual([["media-generate", { kind: "image" }]]);
    });
  });

  describe("generate panels", () => {
    it("generates an image and opens the new file in its own panel", async () => {
      const user = userEvent.setup();
      const { api } = renderMediaView("media-generate", { kind: "image" }, "/media");

      await user.type(await screen.findByLabelText(/Prompt/i), "a red panda");
      await user.click(screen.getByRole("button", { name: /Generate Image/ }));

      await waitFor(() => expect(generateImage).toHaveBeenCalled());
      expect(generateImage.mock.calls[0]![0]).toMatchObject({ agentId: "agent-new", request: { prompt: "a red panda" } });
      await waitFor(() => expect(api.opened).toEqual([expect.objectContaining({ viewId: "media-item", params: { filename: "cat.png" } })]));
      expect(pathname()).toBe("/media/cat.png");
    });

    it("explains how to configure a provider when no generation models exist", async () => {
      state.imageModels = { "dall-e-3": { available: false } };
      renderMediaView("media-generate", { kind: "image" });

      const notice = await screen.findByTestId("no-models-notice");
      expect(notice).toHaveTextContent("No image generation models available");
      expect(notice).toHaveTextContent("ai.providers");
      expect(screen.getByRole("link", { name: /Open AI model configuration/ })).toHaveAttribute("href", "/configuration/%40tokenring-ai%2Fai-client");
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("generates speech from the audio panel", async () => {
      const user = userEvent.setup();
      state.agents = [mediaAgent];
      const { panel } = renderMediaView("media-generate", { kind: "audio" }, "/media");

      await waitFor(() => expect(panel.title).toBe("Generate speech"));
      await user.type(await screen.findByLabelText("Text"), "hello");
      await user.click(screen.getByRole("button", { name: /Generate Speech/ }));

      await waitFor(() => expect(generateSpeech).toHaveBeenCalled());
      expect(generateSpeech.mock.calls[0]![0]).toMatchObject({ agentId: "agent-1", text: "hello" });
    });
  });

  describe("dashboard definition", () => {
    it("opens the entry named by the route in the main area", () => {
      const api = fakeApi();
      api.panels.push({ panelId: "media-gallery", viewId: "media-gallery", params: {}, title: "Gallery" });
      const match = (path: string, params: Record<string, string | undefined>) => ({ pathname: path, params, searchParams: new URLSearchParams() });

      dashboard.onNavigate?.(match("/media", {}), api);
      dashboard.onNavigate?.({ ...match("/media", {}), searchParams: new URLSearchParams("generate=bogus") }, api);
      dashboard.onNavigate?.(match("/media/panda.png", { filename: "panda.png" }), api);

      expect(api.opened.map(open => [open.viewId, open.params])).toEqual([["media-item", { filename: "panda.png" }]]);
      expect(api.opened[0]!.options).toMatchObject({ position: "right", referencePanelId: "media-gallery" });
    });

    it("fills the placeholder panel instead of adding a second media panel", () => {
      const api = fakeApi();
      api.panels.push({ panelId: "media-gallery", viewId: "media-gallery", params: {}, title: "Gallery" });
      api.panels.push({ panelId: "media-item:new", viewId: "media-item", params: {}, title: "Select media" });

      dashboard.onNavigate?.({ pathname: "/media/panda.png", params: { filename: "panda.png" }, searchParams: new URLSearchParams() }, api);

      expect(api.opened).toHaveLength(0);
      expect(api.panels.find(panel => panel.panelId === "media-item:new")?.params).toEqual({ filename: "panda.png" });
    });

    it("maps the active panel back to a URL and titles the document", () => {
      const path = (viewId: string, params: ViewParams = {}) => dashboard.pathForActivePanel?.({ panelId: viewId, viewId, params });

      expect(path("media-item", { filename: "a b.png" })).toBe("/media/a%20b.png");
      expect(path("media-item")).toBeNull();
      expect(path("media-gallery")).toBeNull();
      expect(path("media-generate", { kind: "image" })).toBeNull();
      expect(dashboard.documentTitle?.({ pathname: "/media/panda.png", params: { filename: "panda.png" }, searchParams: new URLSearchParams() })).toBe(
        "panda.png · Media",
      );
    });
  });
});
