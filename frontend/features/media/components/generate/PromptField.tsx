import type { KeyboardEvent } from "react";
import { useId } from "react";

export default function PromptField({
  value,
  onChange,
  onKeyDown,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
}) {
  // Image and video panels can be open side by side, so the id must be per instance.
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-secondary" htmlFor={id}>
        Prompt
      </label>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={4}
        className="w-full bg-input border border-primary rounded-xl py-2.5 px-3 text-sm text-primary placeholder-muted focus-accent transition-all resize-none"
      />
      <p className="text-xs text-muted text-right">⌘↵ to generate</p>
    </div>
  );
}
