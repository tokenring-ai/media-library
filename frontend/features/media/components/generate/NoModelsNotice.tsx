import { Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

/** Configuration page for the AI client plugin, where model providers are set up. */
export const AI_CLIENT_CONFIG_PATH = `/configuration/${encodeURIComponent("@tokenring-ai/ai-client")}`;

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
      <p className="text-muted">
        Generating needs an AI provider that offers {capability}. Add one under <code>ai.providers</code>, or set its API key environment variable (e.g.{" "}
        <code>OPENAI_API_KEY</code>) with <code>ai.autoConfigure</code> on.
      </p>
      <Link to={AI_CLIENT_CONFIG_PATH} className="inline-flex items-center gap-1 font-medium text-accent hover:underline focus-ring rounded">
        <Settings2 className="w-3 h-3" aria-hidden="true" /> Open AI model configuration
      </Link>
    </div>
  );
}
