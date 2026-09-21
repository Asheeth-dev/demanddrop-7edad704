import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/**
 * The demand_requests table is not reachable from the browser (RLS with no
 * public policies). Every read/write happens here, server-side, with the
 * privileged client loaded lazily inside handlers so it never ships to the client.
 */
async function serverDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Speech -> text via Lovable AI (Gemini transcription). */
async function transcribe(audioBase64: string, mimeType: string, apiKey: string) {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const form = new FormData();
  form.append("model", "google/gemini-3.5-transcribe");
  form.append("file", new Blob([bytes], { type: mimeType }), "recording.wav");

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Could not hear that clearly (${res.status}). Please try again.`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** Messy sentence -> clean product name via an LLM. */
async function extractProduct(transcript: string, apiKey: string) {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      messages: [
        {
          role: "system",
          content:
            "You work for an Indian neighbourhood kirana shop. A customer says, in messy everyday speech (English, Hindi or Hinglish), which product they could not find. " +
            "Return ONLY strict JSON: {\"product_name\":string,\"category\":string,\"confidence\":number}. " +
            "product_name must be the clean, standard retail name in English, Title Case, singular (e.g. 'Oatly' -> 'Oat Milk', 'blue sports drink' -> 'Blue Gatorade', 'atta wala brown bread' -> 'Brown Bread'). " +
            "category is one of: Dairy, Bakery, Beverages, Snacks, Staples, Personal Care, Household, Other. " +
            "confidence is 0 to 1. If no product is identifiable, use product_name 'Unclear'.",
        },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI could not process that (${res.status}).`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
    product_name?: string;
    category?: string;
    confidence?: number;
  };
  return {
    product_name: (parsed.product_name || "Unclear").trim(),
    category: parsed.category || "Other",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}

const STATUSES = ["new", "ordering", "stocked", "ignored"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Full pipeline: audio (or typed text) -> transcript -> product -> saved row. */
export const submitDemand = createServerFn({ method: "POST" })
  .inputValidator((input: { audioBase64?: string; mimeType?: string; text?: string }) => {
    // Validate before any AI call or database write.
    const text = typeof input.text === "string" ? input.text.slice(0, 500) : undefined;
    const audioBase64 = typeof input.audioBase64 === "string" ? input.audioBase64 : undefined;
    if (audioBase64 && audioBase64.length > 8_000_000) {
      throw new Error("That recording is too long. Please keep it under a few seconds.");
    }
    const mimeType =
      typeof input.mimeType === "string" && input.mimeType.startsWith("audio/")
        ? input.mimeType
        : "audio/wav";
    return { audioBase64, mimeType, text };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"]!;

    let transcript = (data.text ?? "").trim();
    if (!transcript) {
      if (!data.audioBase64) throw new Error("Nothing was recorded. Please try again.");
      transcript = await transcribe(data.audioBase64, data.mimeType, apiKey);
    }
    if (!transcript) throw new Error("We couldn't hear anything. Please speak a little louder.");
    transcript = transcript.slice(0, 500);

    const product = await extractProduct(transcript, apiKey);
    if (product.product_name.toLowerCase() === "unclear") {
      return { ok: false as const, transcript, message: "We heard you, but couldn't identify a product." };
    }

    const db = await serverDb();
    const { data: row, error } = await db
      .from("demand_requests")
      .insert({
        transcript,
        product_name: product.product_name.slice(0, 80),
        category: product.category.slice(0, 40),
        confidence: product.confidence,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true as const, transcript, request: row };
  });

/** Owner dashboard read. Runs server-side; the browser has no table access. */
export const listDemands = createServerFn({ method: "GET" }).handler(async () => {
  const db = await serverDb();
  const { data, error } = await db
    .from("demand_requests")
    .select("id, transcript, product_name, category, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
});

/** Owner dashboard write: only the status column, only to known values. */
export const setDemandStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[]; status: string }) => {
    const ids = (Array.isArray(input.ids) ? input.ids : []).filter((id) => UUID_RE.test(id)).slice(0, 200);
    if (ids.length === 0) throw new Error("No valid requests selected.");
    if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
      throw new Error("Unknown status.");
    }
    return { ids, status: input.status };
  })
  .handler(async ({ data }) => {
    const db = await serverDb();
    const { error } = await db
      .from("demand_requests")
      .update({ status: data.status })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
