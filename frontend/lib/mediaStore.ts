import { useRefSync } from "@tokenring-ai/one-frontend/hooks/useRefSync.ts";
import { mediaLibraryRPCClient, useMedia } from "@tokenring-ai/one-frontend/rpc.ts";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { MediaEntry, MediaKind } from "../features/media/types.ts";

/**
 * Browser state shared by the Media views (gallery, item panels, generate
 * forms). Each view is its own React subtree, so the kind filter and the
 * search box live here rather than in component state. In memory only.
 */

export interface MediaBrowserState {
  /** Media kind the gallery lists. */
  kind: MediaKind;
  /** Gallery search box, applied to the active kind. */
  search: string;
  /** Keyword (tag) the gallery is filtered to, or null for every entry. Matched case-insensitively. */
  keyword: string | null;
}

const INITIAL: MediaBrowserState = { kind: "image", search: "", keyword: null };

let state: MediaBrowserState = INITIAL;
const listeners = new Set<() => void>();

function update(next: MediaBrowserState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMediaBrowserStore(): MediaBrowserState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function setMediaBrowserState(patch: Partial<MediaBrowserState>): void {
  update({ ...state, ...patch });
}

/** Switching kinds clears the search and keyword filter, as the old in-page tabs did. */
export function selectMediaKind(kind: MediaKind): void {
  if (state.kind === kind && state.search === "" && state.keyword === null) return;
  update({ ...state, kind, search: "", keyword: null });
}

/** Test helper: the current browser state, outside React. */
export function getMediaBrowserStateForTest(): MediaBrowserState {
  return state;
}

/** Test helper. */
export function resetMediaBrowserStore(): void {
  recentlyGenerated.clear();
  update(INITIAL);
}

// ─── The library itself ────────────────────────────────────────────────────────

/**
 * Matches the prior per-kind cap (200 × 3) now that one stream carries every kind.
 * The stream carries the newest entries only; {@link MediaLibrary.total} says how
 * many exist, and {@link useMediaEntry} fetches an older one on demand.
 */
export const MEDIA_STREAM_LIMIT = 600;

export interface MediaLibrary {
  entries: MediaEntry[];
  byKind: Record<MediaKind, MediaEntry[]>;
  /** Entries in the library, including ones beyond the streamed window. */
  total: number;
  isLoading: boolean;
  /** Stream error message, or null. */
  error: string | null;
  /** True once the stream has delivered a snapshot (so "not found" is meaningful). */
  loaded: boolean;
  refresh: () => void;
}

const EMPTY_ENTRIES: MediaEntry[] = [];

/**
 * Bumped by {@link refreshMediaLibrary}; every mounted library stream reconnects,
 * so "Refresh" in the gallery and a finished generation update every panel.
 */
let refreshNonce = 0;
const refreshListeners = new Set<() => void>();

export function refreshMediaLibrary(): void {
  refreshNonce += 1;
  for (const listener of refreshListeners) listener();
}

function useRefreshNonce(): number {
  return useSyncExternalStore(
    listener => {
      refreshListeners.add(listener);
      return () => {
        refreshListeners.delete(listener);
      };
    },
    () => refreshNonce,
    () => refreshNonce,
  );
}

/** One stream for every kind, so the tab counts stay populated without three sockets. */
export function useMediaLibrary(): MediaLibrary {
  const media = useMedia({ limit: MEDIA_STREAM_LIMIT });
  const entries = (media.data?.media ?? EMPTY_ENTRIES) as MediaEntry[];

  // A refresh requested anywhere reconnects this panel's stream too.
  const nonce = useRefreshNonce();
  const mutateRef = useRefSync(media.mutate);
  const seenNonceRef = useRef(nonce);
  useEffect(() => {
    if (seenNonceRef.current === nonce) return;
    seenNonceRef.current = nonce;
    void mutateRef.current();
  }, [mutateRef, nonce]);

  const byKind = useMemo(() => {
    const grouped: Record<MediaKind, MediaEntry[]> = { image: [], video: [], audio: [] };
    for (const entry of entries) grouped[entry.kind].push(entry);
    return grouped;
  }, [entries]);

  return {
    entries,
    byKind,
    total: Math.max(media.data?.count ?? 0, entries.length),
    isLoading: media.isLoading,
    error: media.error?.message ?? null,
    loaded: media.data !== undefined,
    refresh: refreshMediaLibrary,
  };
}

// ─── One entry, inside or outside the streamed window ─────────────────────────

/** Max matches requested when looking one file up by name. */
const LOOKUP_LIMIT = 200;

export interface MediaEntryLookup {
  entry: MediaEntry | null;
  /** True while the library or a by-name lookup is still in flight. */
  loading: boolean;
  /** Library stream error or lookup error, or null. */
  error: string | null;
  /** True once it is settled that the file is not in the library. */
  notFound: boolean;
  retry: () => void;
}

/**
 * Resolves one media file for its panel. Most files are in the streamed
 * window; an older one (a deep link, a bookmark) is fetched by name with
 * `getMedia`, so it does not show as "not found" just because newer files
 * pushed it out of the window.
 */
export function useMediaEntry(filename: string, options: { waitForStream?: boolean } = {}): MediaEntryLookup {
  const library = useMediaLibrary();
  const streamed = library.entries.find(candidate => candidate.filename === filename) ?? null;
  const [lookup, setLookup] = useState<{ filename: string; entry: MediaEntry | null; error: string | null; attempt: number } | null>(null);
  const [attempt, bumpAttempt] = useReducer((count: number) => count + 1, 0);

  // Look the file up only once the stream has settled without it.
  const shouldLookUp = streamed === null && library.loaded && !options.waitForStream;

  useEffect(() => {
    if (!shouldLookUp) return;
    let cancelled = false;
    mediaLibraryRPCClient
      .getMedia({ search: filename, limit: LOOKUP_LIMIT })
      .then(result => {
        if (cancelled) return;
        const found = (result.media as MediaEntry[]).find(candidate => candidate.filename === filename) ?? null;
        setLookup({ filename, entry: found, error: null, attempt });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLookup({ filename, entry: null, error: error instanceof Error ? error.message : String(error), attempt });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, filename, shouldLookUp]);

  const retry = useCallback(() => {
    if (library.error) library.refresh();
    bumpAttempt();
  }, [library]);

  if (streamed) return { entry: streamed, loading: false, error: null, notFound: false, retry };
  if (!library.loaded) {
    return { entry: null, loading: library.error === null, error: library.error, notFound: false, retry };
  }
  if (options.waitForStream) return { entry: null, loading: true, error: null, notFound: false, retry };
  const settled = lookup !== null && lookup.filename === filename && lookup.attempt === attempt ? lookup : null;
  if (!settled) return { entry: null, loading: true, error: null, notFound: false, retry };
  if (settled.error) return { entry: null, loading: false, error: settled.error, notFound: false, retry };
  return { entry: settled.entry, loading: false, error: null, notFound: settled.entry === null, retry };
}

// ─── Freshly generated files ───────────────────────────────────────────────────

/**
 * A just-generated file opens immediately, but the library stream polls and may
 * be a snapshot behind. Remember recent generations so its panel waits instead
 * of claiming the file does not exist.
 */
export const GENERATED_GRACE_MS = 30_000;
const recentlyGenerated = new Map<string, number>();

export function markGenerated(filename: string): void {
  recentlyGenerated.set(filename, Date.now());
}

export function wasRecentlyGenerated(filename: string): boolean {
  const at = recentlyGenerated.get(filename);
  if (at === undefined) return false;
  if (Date.now() - at > GENERATED_GRACE_MS) {
    recentlyGenerated.delete(filename);
    return false;
  }
  return true;
}

/**
 * {@link wasRecentlyGenerated} for a component: while `watch` is true and the
 * file is inside its grace period, schedules a re-render for when the period
 * ends. Nothing else changes at that moment, so without the timer a panel
 * waiting on the file would keep its spinner forever.
 */
export function useRecentlyGenerated(filename: string, watch: boolean): boolean {
  const [, expire] = useReducer((count: number) => count + 1, 0);
  const recent = watch && wasRecentlyGenerated(filename);
  const generatedAt = recent ? recentlyGenerated.get(filename) : undefined;

  useEffect(() => {
    if (generatedAt === undefined) return;
    // +1 because the grace period is inclusive of its last millisecond.
    const timer = setTimeout(expire, Math.max(0, generatedAt + GENERATED_GRACE_MS - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [generatedAt]);

  return recent;
}

/**
 * Filters a kind's entries by the gallery search (filename, prompt, keywords)
 * and, when set, an exact keyword (case-insensitive).
 */
export function filterMediaEntries(entries: readonly MediaEntry[], search: string, keyword: string | null = null): MediaEntry[] {
  const query = search.trim().toLowerCase();
  const tag = keyword?.toLowerCase() ?? null;
  return entries.filter(
    entry =>
      (tag === null || entry.keywords.some(candidate => candidate.toLowerCase() === tag)) &&
      (!query ||
        entry.filename.toLowerCase().includes(query) ||
        entry.prompt?.toLowerCase().includes(query) ||
        entry.keywords.some(candidate => candidate.toLowerCase().includes(query))),
  );
}

/** Distinct keywords across entries (first spelling wins), most used first, then alphabetical. */
export function collectKeywords(entries: readonly MediaEntry[]): { keyword: string; count: number }[] {
  const counts = new Map<string, { keyword: string; count: number }>();
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const keyword of entry.keywords) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { keyword, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
}
