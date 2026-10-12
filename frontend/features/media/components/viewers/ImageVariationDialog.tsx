import type { ImageIndexEntry } from "@tokenring-ai/media-library/rpc/schema";
import { imageGenerationRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Dialog, SegmentedControl, Select, TextArea, TextField, toastManager } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { SlidersHorizontal, WandSparkles } from "lucide-react";
import { useState } from "react";
import type { EnsureAgent } from "../../types.ts";
import type { ImageShape } from "../generate/ImageShapeField.tsx";

type Mode = "variation" | "adjust";
type AdjustFormat = "keep" | "jpeg" | "png" | "webp";

const SHAPES: { value: ImageShape; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "ultrawide", label: "Ultrawide" },
  { value: "ultratall", label: "Ultratall" },
];

/** Closest generation shape to the source image, so a variation keeps its framing. */
export function shapeForImage(width: number | undefined, height: number | undefined): ImageShape {
  if (!width || !height) return "square";
  const ratio = width / height;
  if (ratio >= 2) return "ultrawide";
  if (ratio <= 0.5) return "ultratall";
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

function parseOptionalNumber(value: string): number | undefined | null {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * "Edit / variation" for one library image. Variation generates a new image
 * from an edited copy of the source prompt (keeping its tags and framing);
 * Adjust saves a scaled / re-encoded / brightened copy. Either way the result
 * is a new library file, handed to `onCreated`.
 */
export default function ImageVariationDialog({
  image,
  ensureAgent,
  onCreated,
  onClose,
}: {
  image: ImageIndexEntry;
  ensureAgent: EnsureAgent;
  onCreated: (filename: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("variation");
  const [prompt, setPrompt] = useState(image.prompt ?? "");
  const [shape, setShape] = useState<ImageShape>(() => shapeForImage(image.width, image.height));
  const [format, setFormat] = useState<AdjustFormat>("keep");
  const [scale, setScale] = useState("1");
  const [brightness, setBrightness] = useState("1");
  const [quality, setQuality] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scaleValue = parseOptionalNumber(scale);
  const brightnessValue = parseOptionalNumber(brightness);
  const qualityValue = parseOptionalNumber(quality);
  const adjustError =
    scaleValue === null || (scaleValue !== undefined && (scaleValue <= 0 || scaleValue > 8))
      ? "Scale must be a number above 0 and at most 8"
      : brightnessValue === null || (brightnessValue !== undefined && (brightnessValue < 0 || brightnessValue > 10))
        ? "Brightness must be a number from 0 to 10"
        : qualityValue === null || (qualityValue !== undefined && (!Number.isInteger(qualityValue) || qualityValue < 1 || qualityValue > 100))
          ? "Quality must be a whole number from 1 to 100"
          : null;
  const adjustNoop = format === "keep" && (scaleValue ?? 1) === 1 && (brightnessValue ?? 1) === 1 && qualityValue === undefined;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const agentId = await ensureAgent();
      if (!agentId) return;
      let filename: string | undefined;
      if (mode === "variation") {
        const result = await imageGenerationRPCClient.generateImage({
          agentId,
          request: { prompt: prompt.trim(), sizing: { method: "guided", quality: "standard", shape }, keywords: image.keywords },
        });
        if (result.status !== "success") throw new Error("Agent not found");
        filename = result.results[0]?.fileName;
      } else {
        const result = await imageGenerationRPCClient.adjustImage({
          agentId,
          request: {
            source: image.filename,
            ...(format !== "keep" && { format }),
            ...(scaleValue !== undefined && scaleValue !== null && scaleValue !== 1 && { scale: scaleValue }),
            ...(brightnessValue !== undefined && brightnessValue !== null && brightnessValue !== 1 && { brightness: brightnessValue }),
            ...(qualityValue !== undefined && qualityValue !== null && { quality: qualityValue }),
          },
        });
        if (result.status !== "success") throw new Error("Agent not found");
        filename = result.fileName;
      }
      if (!filename) throw new Error("No image was produced");
      toastManager.success(`Saved ${filename} to the library`, { duration: 3000 });
      onCreated(filename);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDisabled = mode === "variation" ? !prompt.trim() : adjustError !== null || adjustNoop;

  return (
    <Dialog
      title="Edit / variation"
      description={image.filename}
      onClose={() => {
        if (!busy) onClose();
      }}
      width="w-[28rem] max-w-[calc(100vw-2rem)]"
      busy={busy}
      error={error ?? (mode === "adjust" ? adjustError : null)}
      confirmLabel={mode === "variation" ? "Generate variation" : "Save adjusted copy"}
      confirmIcon={mode === "variation" ? WandSparkles : SlidersHorizontal}
      confirmDisabled={confirmDisabled}
      onConfirm={() => void run()}
      footerClassName="mt-4"
    >
      <div className="space-y-3">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          ariaLabel="Edit mode"
          size="sm"
          options={[
            { value: "variation", label: "Variation" },
            { value: "adjust", label: "Adjust" },
          ]}
        />
        {mode === "variation" ? (
          <>
            <TextArea
              label="Prompt"
              hint={image.prompt ? "Edit the original prompt to steer the variation." : "This image has no recorded prompt; describe the variation."}
              value={prompt}
              onChange={setPrompt}
              rows={5}
            />
            <Select label="Shape" value={shape} onChange={value => setShape(value as ImageShape)}>
              {SHAPES.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <>
            <Select label="Format" value={format} onChange={value => setFormat(value as AdjustFormat)}>
              <option value="keep">Keep current format</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </Select>
            <div className="grid grid-cols-3 gap-2">
              <TextField label="Scale" value={scale} onChange={setScale} inputMode="decimal" hint="1 = same size" />
              <TextField label="Brightness" value={brightness} onChange={setBrightness} inputMode="decimal" hint="1 = unchanged" />
              <TextField label="Quality" value={quality} onChange={setQuality} inputMode="numeric" placeholder="auto" hint="1–100, lossy" />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
