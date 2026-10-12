/** React-free route helpers shared by the dashboard definition and the views. */

export const MEDIA_PATH = "/media";

/** `/media/<filename>` for one entry, `/media` for the bare dashboard. */
export function mediaItemPath(filename: string | null | undefined): string {
  return filename ? `${MEDIA_PATH}/${encodeURIComponent(filename)}` : MEDIA_PATH;
}

/** Search parameter the dashboard's `onNavigate` reads to open a generation form. */
export const MEDIA_GENERATE_PARAM = "generate";

/** `/media?generate=<kind>`: lands on the Media dashboard with that kind's generation form open. */
export function mediaGeneratePath(kind: string): string {
  return `${MEDIA_PATH}?${new URLSearchParams({ [MEDIA_GENERATE_PARAM]: kind }).toString()}`;
}
