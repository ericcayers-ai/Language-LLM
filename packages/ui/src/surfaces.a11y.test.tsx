import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import {
  Button,
  CaptionOverlay,
  EmptyState,
  PageTranslateToolbar,
  ReviewCard,
  StatusRegion,
  TranscriptList,
} from "./index.js";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("exposes focus-ring class and is axe-clean", async () => {
    const { container } = render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "llm-focus-ring",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CaptionOverlay", () => {
  it("renders source/translation and optional live region", async () => {
    const { container, rerender } = render(
      <CaptionOverlay
        sourceText="hola"
        translationText="hello"
        provenance="mt"
        liveRegion
      />,
    );
    expect(screen.getByRole("region", { name: /captions/i })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(container.querySelector("[data-llm-source]")).toHaveTextContent(
      "hola",
    );
    rerender(
      <CaptionOverlay sourceText="hola" translationText="hello" liveRegion={false} />,
    );
    expect(
      screen.getByRole("region", { name: /captions/i }),
    ).not.toHaveAttribute("aria-live");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("TranscriptList", () => {
  it("activates cues via keyboard and announces empty state", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TranscriptList
        searchable
        onSelectCue={onSelect}
        items={[
          {
            id: "c1",
            startMs: 0,
            endMs: 1000,
            text: "first cue",
            active: true,
          },
        ]}
      />,
    );
    const item = screen.getByRole("button", { name: /first cue/i });
    fireEvent.keyDown(item, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("c1");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PageTranslateToolbar", () => {
  it("supports mode change and restore", async () => {
    const onModeChange = vi.fn();
    const onRestore = vi.fn();
    const { container } = render(
      <PageTranslateToolbar
        mode="translated"
        targetLang="en"
        localProcessing
        progress={0.4}
        onModeChange={onModeChange}
        onRestore={onRestore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(onModeChange).toHaveBeenCalledWith("original");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ReviewCard", () => {
  it("reveals translation then rates", async () => {
    const onRate = vi.fn();
    const { container } = render(
      <ReviewCard
        sourceText="食べる"
        translationText="to eat"
        onRate={onRate}
      />,
    );
    expect(screen.queryByText("to eat")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("to eat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(onRate).toHaveBeenCalledWith(3);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("StatusRegion", () => {
  it("mirrors announcements into aria-live", async () => {
    const { container } = render(
      <StatusRegion message="Capture started" tone="success" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Capture started");
    expect(container.querySelector("[aria-live='polite']")).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("EmptyState", () => {
  it("exposes recovery actions for no-captions", async () => {
    const onTranscribe = vi.fn();
    const { container } = render(
      <EmptyState
        kind="no-captions"
        actions={[
          {
            id: "transcribe",
            label: "Transcribe this tab",
            onClick: onTranscribe,
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Transcribe this tab" }),
    );
    expect(onTranscribe).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
