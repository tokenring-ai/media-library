import NavigationSidebarHeader from "@tokenring-ai/one-frontend/components/layout/NavigationSidebarHeader.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import SearchInput from "@tokenring-ai/one-frontend/components/ui/SearchInput.tsx";
import { Select } from "@tokenring-ai/one-frontend/ui";
import { AlertTriangle, FileMusic, ImageIcon, Loader2, RefreshCw, Upload, Video as VideoIcon, WandSparkles } from "lucide-react";
import type { MediaEntry, MediaKind } from "../types.ts";
import AudioThumbnail from "./thumbnails/AudioThumbnail.tsx";
import ImageThumbnail from "./thumbnails/ImageThumbnail.tsx";
import VideoThumbnail from "./thumbnails/VideoThumbnail.tsx";

export default function GallerySidebar({
  kind,
  search,
  loading,
  error,
  selectedFilename,
  entries,
  onSearch,
  onSelect,
  onRefresh,
  onGenerate,
  onUpload,
  uploading = false,
  keywords = [],
  keyword = null,
  onKeyword,
  windowNote,
}: {
  kind: MediaKind;
  search: string;
  loading: boolean;
  error?: string | null;
  selectedFilename: string | null;
  entries: MediaEntry[];
  onSearch: (q: string) => void;
  onSelect: (entry: MediaEntry) => void;
  onRefresh: () => void;
  onGenerate: () => void;
  /** Opens the upload picker; omitted hides the action. */
  onUpload?: (() => void) | undefined;
  uploading?: boolean | undefined;
  /** Keywords offered by the tag filter (most used first). */
  keywords?: readonly { keyword: string; count: number }[] | undefined;
  /** Active tag filter, or null. */
  keyword?: string | null | undefined;
  onKeyword?: ((keyword: string | null) => void) | undefined;
  /** Shown when the library holds more files than the gallery received. */
  windowNote?: string | null;
}) {
  const EmptyIcon = kind === "image" ? ImageIcon : kind === "video" ? VideoIcon : FileMusic;
  const kindLabel = kind === "audio" ? "audio" : `${kind}s`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <NavigationSidebarHeader
        title="Gallery"
        meta={loading ? undefined : entries.length}
        actions={[
          {
            key: "generate",
            icon: <WandSparkles className="w-3.5 h-3.5" />,
            label: `Generate ${kind === "audio" ? "speech" : kind}`,
            title: `Generate ${kind === "audio" ? "speech" : kind}`,
            onClick: onGenerate,
          },
          ...(onUpload
            ? [
                {
                  key: "upload",
                  icon: uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />,
                  label: "Upload media",
                  title: "Upload files into the library",
                  onClick: onUpload,
                },
              ]
            : []),
          {
            key: "refresh",
            icon: <RefreshCw className={loading ? "w-3 h-3 animate-spin" : "w-3 h-3"} />,
            label: "Refresh gallery",
            title: "Rescan the media folder and refresh",
            onClick: onRefresh,
          },
        ]}
      />
      <div className="shrink-0 px-3 py-2 border-b border-primary">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder={`Search ${kindLabel}...`}
          aria-label={`Search ${kindLabel}`}
          inputProps={{
            onKeyDown: e => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            },
          }}
        />
        {onKeyword && (keywords.length > 0 || keyword !== null) && (
          <Select className="mt-2" value={keyword ?? ""} onChange={value => onKeyword(value === "" ? null : value)} aria-label="Filter by tag">
            <option value="">All tags</option>
            {keyword !== null && !keywords.some(option => option.keyword.toLowerCase() === keyword.toLowerCase()) && <option value={keyword}>{keyword}</option>}
            {keywords.map(option => (
              <option key={option.keyword} value={option.keyword}>
                {option.keyword} ({option.count})
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Library stream error</p>
              <p className="opacity-80 break-words">{error}</p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-1.5 text-xs font-medium underline underline-offset-2 hover:text-white transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {loading && entries.length === 0 ? (
          <LoadingState size="sm" className="py-10" />
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
            <EmptyIcon className="w-8 h-8 text-muted opacity-30" />
            <p className="text-sm text-muted">
              {search ? `No ${kindLabel} matching "${search}"` : keyword ? `No ${kindLabel} tagged "${keyword}"` : `No ${kindLabel} yet`}
            </p>
            {!search && !keyword && (
              <button
                type="button"
                onClick={onGenerate}
                className="text-xs text-accent hover:text-accent-soft cursor-pointer transition-colors focus-ring rounded"
              >
                Generate your first {kind === "audio" ? "clip" : kind} →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {entries.map(entry => {
              switch (entry.kind) {
                case "image":
                  return <ImageThumbnail key={entry.filename} image={entry} selected={selectedFilename === entry.filename} onClick={() => onSelect(entry)} />;
                case "video":
                  return <VideoThumbnail key={entry.filename} video={entry} selected={selectedFilename === entry.filename} onClick={() => onSelect(entry)} />;
                case "audio":
                  return <AudioThumbnail key={entry.filename} audio={entry} selected={selectedFilename === entry.filename} onClick={() => onSelect(entry)} />;
                default: {
                  const exhaustive: never = entry;
                  return exhaustive;
                }
              }
            })}
          </div>
        )}
      </div>

      {windowNote && (
        <p className="shrink-0 border-t border-primary px-3 py-1.5 text-xs text-muted" data-testid="media-window-note">
          {windowNote}
        </p>
      )}
      <div className="shrink-0 border-t border-primary px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-muted">
          {entries.length} {kind === "audio" ? (entries.length === 1 ? "clip" : "clips") : entries.length === 1 ? kind : `${kind}s`}
          {loading && entries.length > 0 && <Loader2 className="inline-block w-3 h-3 ml-1.5 animate-spin opacity-60 align-[-2px]" aria-label="Refreshing" />}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="p-1 text-muted hover:text-primary transition-colors cursor-pointer rounded focus-ring"
          title="Refresh"
          aria-label="Refresh gallery"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
