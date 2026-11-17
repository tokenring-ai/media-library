import { AI_PROVIDERS_PATH } from "@tokenring-ai/one-frontend/apps/configuration/manifest.ts";
import { Plug } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Replaces the model picker when no provider offers a model of this kind, so
 * the disabled Generate button is not left unexplained.
 */
export default function NoModelsNotice({ capability }: { capability: string }) {
  return (
    <div
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-secondary space-y-1.5"
      role="status"
      data-testid="no-models-notice"
    >
      <p className="font-medium text-primary">No {capability} models available</p>
      <p className="text-muted">Generating needs an AI provider that offers {capability}. Connect one by pasting its API key.</p>
      <Link to={AI_PROVIDERS_PATH} className="inline-flex items-center gap-1 font-medium text-accent hover:underline focus-ring rounded">
        <Plug className="w-3 h-3" aria-hidden="true" /> Connect an AI provider
      </Link>
    </div>
  );
}
