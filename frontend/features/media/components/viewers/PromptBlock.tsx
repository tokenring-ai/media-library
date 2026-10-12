import { useCopyToClipboard } from "@tokenring-ai/one-frontend/hooks/useCopyToClipboard.ts";
import { Check, Copy } from "lucide-react";

/** The generation prompt under a media preview, with a copy button. */
export default function PromptBlock({ prompt }: { prompt: string }) {
  const { copy, copied } = useCopyToClipboard({ label: "prompt" });
  return (
    <div className="w-full max-w-2xl mx-auto" data-testid="media-prompt">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs font-medium text-muted uppercase tracking-wide">Prompt</p>
        <button
          type="button"
          onClick={() => void copy(prompt)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted hover:text-primary rounded focus-ring cursor-pointer"
          aria-label="Copy prompt"
          title="Copy prompt"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-secondary italic line-clamp-4 select-text">{prompt}</p>
    </div>
  );
}
