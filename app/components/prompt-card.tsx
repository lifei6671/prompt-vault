import type { PromptCardData } from "../services/prompt.server";
import { previewImageUrl } from "../lib/explore";

export function PromptCard({ prompt, imageBaseUrl, eager }: {
  prompt: PromptCardData;
  imageBaseUrl: string;
  eager: boolean;
}) {
  return (
    <article className="prompt-card">
      <a href={`/prompt/${encodeURIComponent(prompt.slug)}`} className="prompt-card-link">
        <div className="prompt-image">
          <img
            src={previewImageUrl(imageBaseUrl, prompt.preview_image_key)}
            width={prompt.preview_width}
            height={prompt.preview_height}
            alt={prompt.image_alt}
            loading={eager ? "eager" : "lazy"}
          />
          {prompt.ratio && <span className="ratio-badge">{prompt.ratio}</span>}
        </div>
        <div className="prompt-card-body">
          <h2>{prompt.title}</h2>
          <p>{[prompt.model, prompt.category_name].filter(Boolean).join(" · ")}</p>
        </div>
      </a>
    </article>
  );
}

