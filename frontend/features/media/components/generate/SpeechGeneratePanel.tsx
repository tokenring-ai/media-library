import GenerateButton from "@tokenring-ai/one-frontend/components/ui/GenerateButton.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { audioRPCClient, useSpeechModels } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Mic } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import type { EnsureAgent } from "../../types.ts";
import { keywordsFromPrompt } from "../../utils.ts";
import GeneratePanelShell from "./GeneratePanelShell.tsx";
import ModelSelectField from "./ModelSelectField.tsx";
import NoModelsNotice from "./NoModelsNotice.tsx";

export default function SpeechGeneratePanel({ ensureAgent, onGenerated }: { ensureAgent: EnsureAgent; onGenerated: (filename?: string) => void }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState<number>(1);
  const [model, setModel] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const { data: modelsData } = useSpeechModels();

  const availableModels = useMemo(() => {
    if (!modelsData) return [];
    return Object.entries(modelsData.models)
      .filter(([, m]) => m.available)
      .map(([name]) => name);
  }, [modelsData]);

  const selectedModel = model || availableModels[0] || "";

  const handleGenerate = async () => {
    if (!text.trim()) {
      toastManager.error("Please enter some text", { duration: 3000 });
      return;
    }
    setGenerating(true);
    try {
      // Generation needs an agent; attach to the media agent, starting one if needed.
      const agentId = await ensureAgent();
      if (!agentId) return;
      const result = await audioRPCClient.generateSpeech({
        agentId,
        text: text.trim(),
        ...(voice && { voice }),
        ...(speed > 0 && { speed }),
        ...(selectedModel && { model: selectedModel }),
        keywords: keywordsFromPrompt(text),
      });
      if (result.status === "success") {
        if (!result.filename) {
          toastManager.error("Speech generation returned no file", { duration: 4000 });
          onGenerated();
          return;
        }
        toastManager.success(`Speech generated: ${result.filename}`, { duration: 3000 });
        setText("");
        onGenerated(result.filename);
      } else {
        toastManager.error("Agent not found", { duration: 4000 });
      }
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleGenerate();
  };

  return (
    <GeneratePanelShell
      title="Generate Speech"
      subtitle="Convert text to spoken audio"
      icon={<Mic className="w-7 h-7 text-white" />}
      gradient="from-emerald-500 to-teal-600"
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-secondary" htmlFor="speech-text">
          Text
        </label>
        <textarea
          id="speech-text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Hello, welcome to the TokenRing media studio..."
          rows={5}
          className="w-full bg-input border border-primary rounded-xl py-2.5 px-3 text-sm text-primary placeholder-muted focus-accent transition-all resize-none"
        />
        <p className="text-xs text-muted text-right">⌘↵ to generate</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-secondary" htmlFor="speech-voice">
            Voice
          </label>
          <input
            id="speech-voice"
            type="text"
            value={voice}
            onChange={e => setVoice(e.target.value)}
            placeholder="alloy"
            className="w-full bg-input border border-primary rounded-lg py-2 px-3 text-sm text-primary placeholder-muted focus-accent transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-secondary" htmlFor="speech-speed">
            Speed
          </label>
          <input
            id="speech-speed"
            type="number"
            step={0.1}
            min={0.25}
            max={4}
            value={speed}
            onChange={e => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw) || raw <= 0) {
                setSpeed(1);
                return;
              }
              setSpeed(Math.min(4, Math.max(0.25, raw)));
            }}
            className="w-full bg-input border border-primary rounded-lg py-2 px-3 text-sm text-primary focus-accent transition-all"
          />
        </div>
      </div>
      {modelsData != null && availableModels.length === 0 ? (
        <NoModelsNotice capability="speech" />
      ) : (
        <ModelSelectField label="Model" value={selectedModel} onChange={setModel} options={availableModels} />
      )}
      <GenerateButton
        onClick={() => void handleGenerate()}
        disabled={generating || !text.trim() || (modelsData != null && availableModels.length === 0)}
        loading={generating}
      >
        Generate Speech
      </GenerateButton>
    </GeneratePanelShell>
  );
}
