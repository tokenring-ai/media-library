import { Badge, Button, TextField } from "@tokenring-ai/one-frontend/ui";
import { Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { MediaItemActions } from "../../../lib/mediaActions.tsx";
import type { MediaEntry } from "../types.ts";

/** Splits typed input into tags on commas. */
function parseTags(value: string): string[] {
  return value
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
}

/**
 * The bar under a media preview: editable tags (keywords) plus rename and
 * delete. Tag edits save immediately; the gallery's tag filter uses them.
 */
export default function MediaItemDetails({ entry, actions }: { entry: MediaEntry; actions: MediaItemActions }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (keywords: string[]) => {
    setSaving(true);
    try {
      return await actions.saveKeywords(keywords);
    } finally {
      setSaving(false);
    }
  };

  const addTags = async () => {
    const additions = parseTags(draft).filter(tag => !entry.keywords.some(existing => existing.toLowerCase() === tag.toLowerCase()));
    if (additions.length === 0) {
      setDraft("");
      return;
    }
    if (await save([...entry.keywords, ...additions])) setDraft("");
  };

  return (
    <div className="shrink-0 border-t border-primary bg-secondary px-4 py-2.5 space-y-2" data-testid="media-item-details">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tags">
        <Tag className="w-3.5 h-3.5 text-muted" aria-hidden />
        {entry.keywords.length === 0 && <span className="text-xs text-muted">No tags</span>}
        {entry.keywords.map(keyword => (
          <Badge key={keyword} tone="neutral" className="gap-1 pr-1">
            {keyword}
            <button
              type="button"
              onClick={() => void save(entry.keywords.filter(candidate => candidate !== keyword))}
              disabled={saving}
              className="rounded text-muted hover:text-primary focus-ring cursor-pointer disabled:cursor-not-allowed"
              aria-label={`Remove tag ${keyword}`}
              title={`Remove tag ${keyword}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <TextField
          className="flex-1 min-w-0"
          value={draft}
          onChange={setDraft}
          placeholder="Add tags, comma separated"
          aria-label="Add tags"
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addTags();
            }
          }}
          disabled={saving}
        />
        <Button variant="secondary" icon={Plus} onClick={() => void addTags()} disabled={!draft.trim()} busy={saving}>
          Add
        </Button>
        <Button variant="ghost" icon={Pencil} onClick={actions.openRename} disabled={actions.busy}>
          Rename
        </Button>
        <Button variant="ghost" icon={Trash2} onClick={() => void actions.requestDelete()} disabled={actions.busy} className="text-danger">
          Delete
        </Button>
      </div>
      {actions.dialogs}
    </div>
  );
}
