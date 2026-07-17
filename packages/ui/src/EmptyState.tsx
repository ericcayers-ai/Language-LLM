import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./Button.js";

export type EmptyStateKind =
  | "no-captions"
  | "no-companion"
  | "no-model"
  | "model-installing"
  | "no-lyrics"
  | "unsupported-page"
  | "permission-denied"
  | "empty-dictionary"
  | "no-review-due"
  | "generic";

export interface EmptyStateAction {
  id: string;
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost" | "danger";
}

export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  kind: EmptyStateKind;
  title?: string;
  description?: string;
  actions?: EmptyStateAction[];
  children?: ReactNode;
}

const COPY: Record<
  EmptyStateKind,
  { title: string; description: string }
> = {
  "no-captions": {
    title: "No captions on this video",
    description:
      "This page has no human or auto captions. Start a local tab transcription after granting capture.",
  },
  "no-companion": {
    title: "Companion offline",
    description:
      "The local Language-LLM companion is not reachable. Start the desktop app, then retry.",
  },
  "no-model": {
    title: "No model installed",
    description:
      "Install a verified model pack in the desktop companion before running ASR or translation.",
  },
  "model-installing": {
    title: "Model installing",
    description:
      "A model pack is downloading or verifying. Captions will stay unavailable until install finishes.",
  },
  "no-lyrics": {
    title: "No lyrics matched",
    description:
      "Import an LRC/TTML file, or allow an attributed LRCLIB fetch after confirming the track.",
  },
  "unsupported-page": {
    title: "Page not supported here",
    description:
      "Website translation is for ordinary http(s) pages. Use the YouTube overlay on video pages.",
  },
  "permission-denied": {
    title: "Permission needed",
    description:
      "Grant host or capture permission to continue. Access can be revoked anytime from the popup.",
  },
  "empty-dictionary": {
    title: "No dictionary loaded",
    description:
      "Import JMdict, CC-CEDICT, Kaikki, or a Yomitan-compatible archive from the side panel.",
  },
  "no-review-due": {
    title: "Nothing due",
    description:
      "No cards are scheduled. Mine a caption with Alt+M, then return when reviews are due.",
  },
  generic: {
    title: "Nothing here yet",
    description: "Choose a recovery action below, or open the side panel for more tools.",
  },
};

export function EmptyState({
  kind,
  title,
  description,
  actions = [],
  children,
  style,
  className,
  ...rest
}: EmptyStateProps) {
  const copy = COPY[kind];

  return (
    <section
      role="status"
      aria-live="polite"
      data-llm-empty={kind}
      className={["llm-empty", className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      <h2 className="llm-empty__title">{title ?? copy.title}</h2>
      <p className="llm-empty__body">{description ?? copy.description}</p>
      {children}
      {actions.length > 0 ? (
        <div className="llm-empty__actions">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant ?? "primary"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
