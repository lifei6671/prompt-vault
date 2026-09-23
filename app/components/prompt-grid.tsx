import type { PromptCardData } from "../services/prompt.server";
import { PromptCard } from "./prompt-card";

export function PromptGrid({ prompts, imageBaseUrl }: {
  prompts: PromptCardData[];
  imageBaseUrl: string;
}) {
  return (
    <div className="prompt-grid">
      {prompts.map((prompt, index) => (
        <PromptCard key={prompt.slug} prompt={prompt} imageBaseUrl={imageBaseUrl} eager={index < 5} />
      ))}
    </div>
  );
}

