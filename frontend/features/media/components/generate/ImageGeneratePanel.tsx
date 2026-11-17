import EstimatedCost from "@tokenring-ai/one-frontend/components/ui/EstimatedCost.tsx";
import GenerateButton from "@tokenring-ai/one-frontend/components/ui/GenerateButton.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useCostEstimate } from "@tokenring-ai/one-frontend/hooks/useCostEstimate.ts";
import { imageGenerationRPCClient, useImageGenerationModels } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { WandSparkles } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import type { EnsureAgent } from "../../types.ts";
import { keywordsFromPrompt } from "../../utils.ts";
import GeneratePanelShell from "./GeneratePanelShell.tsx";
import ImageQualityField, { type ImageQuality } from "./ImageQualityField.tsx";
import ImageShapeField, { type ImageShape } from "./ImageShapeField.tsx";
import ModelSelectField from "./ModelSelectField.tsx";
import NoModelsNotice from "./NoModelsNotice.tsx";
import PromptField from "./PromptField.tsx";

export default function ImageGeneratePanel({ ensureAgent, onGenerated }: { ensureAgent: EnsureAgent; onGenerated: (filename?: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>("");
  const [shape, setShape] = useState<ImageShape>("square");
  const [quality, setQuality] = useState<ImageQuality>("standard");
  const [generating, setGenerating] = useState(false);
  // A ref, not the state: two Cmd+Enter presses in one render would both pass a state check (and pay twice).
  const generatingRef = useRef(false);
  const { data: modelsData } = useImageGenerationModels();

  const availableModels = useMemo(() => {
    if (!modelsData) return [];
    return Object.entries(modelsData.models)
      .filter(([, m]) => m.available)
      .map(([name]) => name);
  }, [modelsData]);

  const selectedModel = model || availableModels[0] || "";

  // Only options that change the price re-check it; typing the prompt does not.
  const estimate = useCostEstimate(selectedModel ? `${selectedModel}|${shape}|${quality}` : null, () =>
    imageGenerationRPCClient.estimateCost({ model: selectedModel, request: { sizing: { method: "guided", quality, shape } } }),
  );

  const handleGenerate = async () => {
    if (generatingRef.current) return;
    if (!prompt.trim()) {
      toastManager.error("Please enter a prompt", { duration: 3000 });
      return;
    }
    generatingRef.current = true;
    setGenerating(true);
    try {
      // Generation needs an agent; attach to the media agent, starting one if needed.
      const agentId = await ensureAgent();
      if (!agentId) return;
      const result = await imageGenerationRPCClient.generateImage({
        agentId,
        ...(selectedModel && { model: selectedModel }),
        request: {
          prompt: prompt.trim(),
          sizing: {
            method: "guided",
            quality,
            shape,
          },
          keywords: keywordsFromPrompt(prompt),
        },
      });
      if (result.status === "success") {
        const fileName = result.results[0]?.fileName;
        if (!fileName) {
          toastManager.error("Image generation returned no files", { duration: 4000 });
          onGenerated();
          return;
        }
        toastManager.success(`Image generated: ${fileName}`, { duration: 3000 });
        setPrompt("");
        onGenerated(fileName);
      } else {
        toastManager.error("Agent not found", { duration: 4000 });
      }
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleGenerate();
  };

  return (
    <GeneratePanelShell
      title="Generate Image"
      subtitle="Describe the image you want to create"
      icon={<WandSparkles className="w-7 h-7 text-white" />}
      gradient="from-pink-500 to-rose-600"
    >
      <PromptField value={prompt} onChange={setPrompt} onKeyDown={handleKeyDown} placeholder="A serene mountain lake at sunset with reflections..." />
      <ImageShapeField value={shape} onChange={setShape} />
      <ImageQualityField value={quality} onChange={setQuality} />
      {modelsData != null && availableModels.length === 0 ? (
        <NoModelsNotice capability="image generation" />
      ) : (
        <ModelSelectField label="Model" value={selectedModel} onChange={setModel} options={availableModels} />
      )}
      <GenerateButton
        onClick={() => void handleGenerate()}
        disabled={generating || !prompt.trim() || (modelsData != null && availableModels.length === 0)}
        loading={generating}
      >
        Generate Image
      </GenerateButton>
      <EstimatedCost estimate={estimate} />
    </GeneratePanelShell>
  );
}
