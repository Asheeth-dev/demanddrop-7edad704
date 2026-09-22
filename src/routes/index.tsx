import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Keyboard,
  LayoutDashboard,
  ArrowRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";

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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <p className="font-display text-lg font-bold">DemandDrop</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Sharma General Store · Customer counter</p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <LayoutDashboard className="size-3.5" />
          Owner
        </Link>
      </header>

      <div className="mx-auto mt-10 max-w-xl text-center sm:mt-14">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary uppercase">
          <span className="size-2 rounded-full bg-live animate-pulse" />
          Voice request ready
        </div>
        <h1 className="text-3xl leading-tight font-bold sm:text-5xl">Tell the shop what’s missing.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
          Say the product you couldn’t find. AI turns your words into a clear stock request for the owner.
        </p>
      </div>

      <div className="mt-9 flex flex-col items-center sm:mt-12">
        <Button
          type="button"
          onClick={handleMic}
          disabled={busy}
          aria-label={recording ? "Stop recording" : "Start recording"}
          style={recording ? { transform: `scale(${1 + Math.min(level, 0.5) * 0.4})` } : undefined}
          className={`size-40 rounded-full border-8 border-card p-0 text-primary-foreground shadow-2xl transition-all duration-150 focus-visible:outline-none sm:size-48 [&_svg]:size-auto ${
            recording ? "mic-live bg-destructive" : "bg-primary hover:scale-[1.03] active:scale-95"
          }`}
        >
          {busy ? (
            <Loader2 className="size-12 animate-spin" />
          ) : recording ? (
            <Square className="size-11 fill-current" />
          ) : (
            <Mic className="size-14" />
          )}
        </Button>
        <p className="mt-5 min-h-6 text-sm font-semibold text-foreground">
          {busy
            ? "Understanding what you said…"
            : recording
              ? "Listening… tap again when done"
              : "Tap to speak"}
        </p>
      </div>

      <div aria-live="polite" className="mx-auto mt-8 w-full max-w-lg">
        {result?.kind === "success" && (
          <div className="rise-in surface overflow-hidden rounded-xl">
            <div className="flex items-center gap-3 border-b border-border bg-success/10 px-5 py-4 text-left">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-success">Request sent</p>
                <p className="text-xs text-muted-foreground">The owner can see it on the live demand list.</p>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-primary uppercase">
                <Sparkles className="size-3.5" />
                AI identified
              </div>
              <p className="font-display mt-2 text-center text-2xl font-bold">{result.product}</p>
              {result.category && (
                <p className="mt-1 text-center text-xs font-semibold text-muted-foreground">{result.category}</p>
              )}
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border pt-4 text-left">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">You said</p>
                  <p className="mt-1 truncate text-sm">“{result.transcript}”</p>
                </div>
                <ArrowRight className="size-4 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Stock request</p>
                  <p className="mt-1 truncate text-sm font-semibold">{result.product}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setResult(null)}>
                  <RotateCcw />
                  Ask for another
                </Button>
                <Button asChild>
                  <Link to="/dashboard">
                    View owner demand
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
        {result?.kind === "unclear" && (
          <div className="rise-in surface rounded-xl p-5 text-center">
            <AlertCircle className="mx-auto size-8 text-accent" />
            <p className="mt-3 text-sm">
              We heard “{result.transcript}” but couldn't spot a product. Try saying just the item name.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setResult(null)}>
                <Mic />
                Try speaking again
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setTyping(true);
                }}
              >
                <Keyboard />
                Type instead
              </Button>
            </div>
          </div>
        )}
        {result?.kind === "error" && (
          <div className="rise-in rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
            <AlertCircle className="mx-auto size-8 text-destructive" />
            <p className="mt-3 font-semibold text-foreground">We couldn’t send that request.</p>
            <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => setResult(null)}>
              <RotateCcw />
              Try again
            </Button>
          </div>
        )}
      </div>

      <div className="mx-auto mt-auto w-full max-w-lg pt-10">
        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || busy) return;
              void process({ text: text.trim() });
              setText("");
            }}
            className="flex gap-2 rounded-xl border border-border bg-card p-2"
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
               placeholder="Try: I was looking for blue Gatorade"
              className="h-11"
            />
            <Button type="submit" disabled={busy || !text.trim()} className="h-11">
              Send
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTyping(true)}
            className="mx-auto flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Keyboard className="size-3.5" />
            Can't speak right now? Type it instead
          </Button>
        )}
      </div>
    </main>
  );
}
