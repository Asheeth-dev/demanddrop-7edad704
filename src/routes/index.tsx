import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Mic, Square, Loader2, CheckCircle2, AlertCircle, Keyboard, LayoutDashboard } from "lucide-react";

import { submitDemand } from "@/lib/demand.functions";
import { blobToBase64, useRecorder } from "@/lib/useRecorder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DemandDrop — Tell the shop what you couldn't find" },
      {
        name: "description",
        content:
          "Tap and speak the product you couldn't find in the shop. DemandDrop turns your words into a stock request for the shop owner instantly.",
      },
      { property: "og:title", content: "DemandDrop — Speak what's missing" },
      {
        property: "og:description",
        content: "Voice-powered demand tracking for India's small merchants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomerScreen,
});

type Result =
  | { kind: "success"; product: string; category: string | null; transcript: string }
  | { kind: "unclear"; transcript: string }
  | { kind: "error"; message: string };

function CustomerScreen() {
  const { recording, level, start, stop } = useRecorder();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const send = useServerFn(submitDemand);

  async function process(payload: { audioBase64?: string; mimeType?: string; text?: string }) {
    setBusy(true);
    setResult(null);
    try {
      const res = await send({ data: payload });
      if (res.ok) {
        setResult({
          kind: "success",
          product: res.request?.product_name ?? "",
          category: res.request?.category ?? null,
          transcript: res.transcript,
        });
      } else {
        setResult({ kind: "unclear", transcript: res.transcript });
      }
    } catch (err) {
      setResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleMic() {
    if (busy) return;
    if (!recording) {
      setResult(null);
      try {
        await start();
      } catch {
        setResult({
          kind: "error",
          message: "Microphone access is needed. Allow it, or type the item instead.",
        });
        setTyping(true);
      }
      return;
    }
    const blob = await stop();
    if (!blob) {
      setResult({ kind: "error", message: "That recording was empty — please hold and speak again." });
      return;
    }
    await process({ audioBase64: await blobToBase64(blob), mimeType: "audio/wav" });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">DemandDrop</p>
          <p className="text-xs text-muted-foreground">Sharma General Store · Counter</p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <LayoutDashboard className="size-3.5" />
          Owner
        </Link>
      </header>

      <div className="mt-10 text-center">
        <h1 className="text-3xl leading-tight font-semibold">Couldn't find something?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap the mic and just say it. No typing, no scanning.
        </p>
      </div>

      <div className="mt-10 flex flex-col items-center">
        <button
          type="button"
          onClick={handleMic}
          disabled={busy}
          aria-label={recording ? "Stop recording" : "Start recording"}
          style={recording ? { transform: `scale(${1 + Math.min(level, 0.5) * 0.4})` } : undefined}
          className={`flex size-36 items-center justify-center rounded-full text-primary-foreground transition-all duration-150 disabled:opacity-60 ${
            recording ? "mic-live bg-destructive" : "bg-primary hover:brightness-110 active:scale-95"
          }`}
        >
          {busy ? (
            <Loader2 className="size-12 animate-spin" />
          ) : recording ? (
            <Square className="size-11 fill-current" />
          ) : (
            <Mic className="size-14" />
          )}
        </button>
        <p className="mt-5 h-5 text-sm font-medium text-muted-foreground">
          {busy
            ? "Understanding what you said…"
            : recording
              ? "Listening… tap again when done"
              : "Tap to speak"}
        </p>
      </div>

      <div aria-live="polite" className="mt-8">
        {result?.kind === "success" && (
          <div className="rise-in surface rounded-2xl p-5 text-center">
            <CheckCircle2 className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-xs tracking-wide text-muted-foreground uppercase">
              Request sent to the owner
            </p>
            <p className="font-display mt-1 text-2xl font-semibold">{result.product}</p>
            {result.category && (
              <span className="mt-2 inline-block rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                {result.category}
              </span>
            )}
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground italic">
              You said: “{result.transcript}”
            </p>
          </div>
        )}
        {result?.kind === "unclear" && (
          <div className="rise-in surface rounded-2xl p-5 text-center">
            <AlertCircle className="mx-auto size-8 text-accent" />
            <p className="mt-3 text-sm">
              We heard “{result.transcript}” but couldn't spot a product. Try saying just the item name.
            </p>
          </div>
        )}
        {result?.kind === "error" && (
          <div className="rise-in rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
            <AlertCircle className="mx-auto size-8 text-destructive" />
            <p className="mt-3 text-sm text-foreground">{result.message}</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-10">
        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || busy) return;
              void process({ text: text.trim() });
              setText("");
            }}
            className="flex gap-2"
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. I was looking for Oatly"
              className="h-11"
            />
            <Button type="submit" disabled={busy || !text.trim()} className="h-11">
              Send
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            <Keyboard className="size-3.5" />
            Can't speak right now? Type it instead
          </button>
        )}
      </div>
    </main>
  );
}
