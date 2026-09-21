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

/** Full pipeline: audio (or typed text) -> transcript -> product -> saved row. */
export const submitDemand = createServerFn({ method: "POST" })
  .inputValidator((input: { audioBase64?: string; mimeType?: string; text?: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"]!;

    let transcript = (data.text ?? "").trim();
    if (!transcript) {
      if (!data.audioBase64) throw new Error("Nothing was recorded. Please try again.");
      transcript = await transcribe(data.audioBase64, data.mimeType || "audio/wav", apiKey);
    }
    if (!transcript) throw new Error("We couldn't hear anything. Please speak a little louder.");

    const product = await extractProduct(transcript, apiKey);
    if (product.product_name.toLowerCase() === "unclear") {
      return { ok: false as const, transcript, message: "We heard you, but couldn't identify a product." };
    }

    const { data: row, error } = await serverDb()
      .from("demand_requests")
      .insert({
        transcript,
        product_name: product.product_name,
        category: product.category,
        confidence: product.confidence,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true as const, transcript, request: row };
  });
