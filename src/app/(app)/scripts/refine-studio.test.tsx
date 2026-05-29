import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { GeneratedSingleScript } from "@/engines/content";

// The server action pulls in server-only deps (supabase, admin client). Mock
// the whole module so the component test runs in jsdom without them.
const refineScriptChatAction = vi.fn();
vi.mock("./actions", () => ({ refineScriptChatAction: (...a: unknown[]) => refineScriptChatAction(...a) }));

import { RefineStudio } from "./refine-studio";

const SCRIPT: GeneratedSingleScript = {
  hook: "Most coaches lose leads at the same point.",
  body: "It is the discovery call. They lead with credentials. Reverse the order.",
  pillar: "Operator Frameworks",
  angle: "pain_point",
  word_count: 12,
  meta: { generated_at: "2026-05-29T12:00:00.000Z" },
};

const IMF = { idea: "", message: "", feel: "" };

function renderStudio(overrides: Partial<Parameters<typeof RefineStudio>[0]> = {}) {
  return render(
    <RefineStudio
      script={SCRIPT}
      concept="Why coaches lose leads on the discovery call."
      imf={IMF}
      saving={false}
      savedId={null}
      saveError=""
      onBack={() => {}}
      onSave={() => {}}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  refineScriptChatAction.mockReset();
});

describe("RefineStudio", () => {
  it("shows the generated script in editable fields", () => {
    renderStudio();
    expect(screen.getByDisplayValue(SCRIPT.hook)).toBeInTheDocument();
    expect(screen.getByDisplayValue(SCRIPT.body)).toBeInTheDocument();
  });

  it("saves the edited text, not the original", () => {
    const onSave = vi.fn();
    renderStudio({ onSave });
    const body = screen.getByDisplayValue(SCRIPT.body);
    fireEvent.change(body, { target: { value: "A hand-edited body." } });
    fireEvent.click(screen.getByRole("button", { name: /save to library/i }));
    expect(onSave).toHaveBeenCalledWith(SCRIPT.hook, "A hand-edited body.");
  });

  it("sends the message and renders the assistant reply", async () => {
    refineScriptChatAction.mockResolvedValue({ reply: "Here is what I think." });
    renderStudio();
    fireEvent.change(screen.getByPlaceholderText(/ask for a change/i), {
      target: { value: "Is the close strong?" },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(await screen.findByText("Here is what I think.")).toBeInTheDocument();
    expect(refineScriptChatAction).toHaveBeenCalledTimes(1);
    const arg = refineScriptChatAction.mock.calls[0][0];
    expect(arg.currentScript).toEqual({ hook: SCRIPT.hook, body: SCRIPT.body });
    expect(arg.history.at(-1)).toEqual({ role: "user", content: "Is the close strong?" });
  });

  it("renders a diff and accepting it applies the proposed script", async () => {
    refineScriptChatAction.mockResolvedValue({
      reply: "I sharpened the close.",
      proposal: {
        hook: SCRIPT.hook,
        body: "It is the discovery call. Lead with their problem first. Then earn the offer.",
        word_count: 13,
        summary: "Problem-first, sharper close.",
      },
    });
    renderStudio();
    fireEvent.change(screen.getByPlaceholderText(/ask for a change/i), {
      target: { value: "Sharpen the close." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    // Diff appears with the summary and accept/reject controls.
    expect(await screen.findByText("Problem-first, sharper close.")).toBeInTheDocument();
    const accept = screen.getByRole("button", { name: /accept changes/i });
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();

    fireEvent.click(accept);

    // Editor is back, now showing the accepted body.
    await waitFor(() =>
      expect(
        screen.getByDisplayValue(
          "It is the discovery call. Lead with their problem first. Then earn the offer.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("rejecting a proposal keeps the original script", async () => {
    refineScriptChatAction.mockResolvedValue({
      reply: "Here's an option.",
      proposal: {
        hook: SCRIPT.hook,
        body: "A totally different body.",
        word_count: 4,
        summary: "Rewrite.",
      },
    });
    renderStudio();
    fireEvent.change(screen.getByPlaceholderText(/ask for a change/i), {
      target: { value: "Rewrite it." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    fireEvent.click(await screen.findByRole("button", { name: /reject/i }));

    await waitFor(() =>
      expect(screen.getByDisplayValue(SCRIPT.body)).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("A totally different body.")).not.toBeInTheDocument();
  });

  it("does not show a diff when the proposal matches the current script", async () => {
    // The model can re-emit the current script (e.g. right after an accept).
    // An all-equal diff is noise, so no Accept/Reject should appear.
    refineScriptChatAction.mockResolvedValue({
      reply: "It already reads well, so I left it as is.",
      proposal: {
        hook: SCRIPT.hook,
        body: SCRIPT.body,
        word_count: SCRIPT.word_count,
        summary: "No change.",
      },
    });
    renderStudio();
    fireEvent.change(screen.getByPlaceholderText(/ask for a change/i), {
      target: { value: "Improve it." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(
      await screen.findByText("It already reads well, so I left it as is."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept changes/i })).not.toBeInTheDocument();
    // The editor (with the body field) is still shown, not the diff.
    expect(screen.getByDisplayValue(SCRIPT.body)).toBeInTheDocument();
  });

  it("surfaces an action error in the chat", async () => {
    refineScriptChatAction.mockResolvedValue({ error: "The refine assistant hit an error." });
    renderStudio();
    fireEvent.change(screen.getByPlaceholderText(/ask for a change/i), {
      target: { value: "Help" },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(
      await screen.findByText("The refine assistant hit an error."),
    ).toBeInTheDocument();
  });
});
