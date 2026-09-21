# DemandDrop — Know Your Product Briefing

Voice-powered demand tracking for India's small merchants. A customer who can't find
something taps a mic at the counter, says it in plain words, and the shop owner instantly
sees the clean product name ranked by how many people asked for it.

---

## A. What I Need to Know

### Tech stack and why

| Piece | What it is | Why chosen |
| --- | --- | --- |
| React + TypeScript (TanStack Start) | The web app, with server-side functions built in | One codebase for screen + server logic; no separate backend to deploy in 24h |
| Tailwind CSS | Styling via design tokens | Fast, consistent, responsive without writing CSS files |
| Lovable Cloud (Postgres database + Realtime) | Stores every request, pushes live updates | Managed Postgres, no setup, realtime out of the box |
| Lovable AI Gateway — `google/gemini-3.5-transcribe` | Speech → text | Auto-detects language (English/Hindi/Hinglish), handles messy speech |
| Lovable AI Gateway — `google/gemini-3.8-flash` | Text → clean product name | Fast, cheap, good at normalising slang/brands to retail names |
| Web Audio API | Records mic audio as WAV in the browser | Produces a complete, decodable file on every browser incl. iOS Safari |

**No login.** The MVP is a shared counter device and one owner dashboard; auth would add
friction to a 2-minute demo and isn't needed to prove the idea.

### Architecture in one paragraph

The browser records audio and sends it (base64) to a **server function** that runs on the
server, never in the browser. That function calls the speech-to-text model, then calls a
language model that extracts the exact product name, then writes one row to the database.
The owner dashboard subscribes to that table over a realtime websocket, so the new row
appears without refreshing.

### Important files

| File | Purpose |
| --- | --- |
| `src/lib/demand.functions.ts` | The brain. Server function `submitDemand`: transcribe → extract product → save row. Holds the API key server-side. |
| `src/lib/useRecorder.ts` | Browser mic recorder. Captures raw PCM and encodes a 16 kHz mono WAV; also `blobToBase64`. |
| `src/routes/index.tsx` | Customer counter screen: mic button, states, result card, typed fallback. |
| `src/routes/dashboard.tsx` | Owner dashboard: groups requests by product, counts, status control, realtime subscription. |
| `src/styles.css` | Design system — colours, fonts, surfaces, mic pulse animation, all as tokens. |
| `src/routes/__root.tsx` | Shared shell: fonts, metadata, error and 404 screens. |

### Key functions

- `submitDemand({ audioBase64 | text })` — the single end-to-end pipeline call.
- `transcribe()` — multipart upload to the speech endpoint, returns the raw sentence.
- `extractProduct()` — LLM call with a strict JSON contract: `product_name`, `category`, `confidence`.
- `useRecorder()` — `start()` / `stop()`; `stop()` returns a WAV blob or `null` if the clip was silent.
- Dashboard grouping reducer — turns raw request rows into "product + how many asked".

### Database schema

One table, `public.demand_requests`:

| Column | Meaning |
| --- | --- |
| `id` | Unique id |
| `transcript` | Exactly what the customer said (proof / auditability) |
| `product_name` | Clean name the AI extracted, e.g. "Oat Milk" |
| `category` | Dairy, Bakery, Beverages, Snacks, Staples, Personal Care, Household, Other |
| `confidence` | AI's 0–1 certainty |
| `status` | `new`, `ordering`, `stocked`, `ignored` — owner-controlled |
| `created_at` | Timestamp, used for "today" counts and ordering |

No relationships — deliberately one flat table. Demand counts are computed by grouping on
`product_name`, so no second table is needed. Row Level Security is ON; policies allow the
public counter device to add and read requests and the owner to update status.

### Data flow

Customer speaks → browser records WAV → base64 → server function → speech-to-text model →
raw sentence → language model → `{product_name, category, confidence}` → insert row in
Postgres → realtime event → owner dashboard re-fetches and re-ranks → owner sets status.

### Security

Handled: the AI key lives only in server environment variables and is never in browser code;
RLS is enabled on the table; all AI calls happen server-side; input is validated before insert.
Deliberately skipped for time: no authentication, no rate limiting on submissions, and write
access is open to anyone with the counter URL (fine for an in-store tablet, not for production).

---

## B. Judge Explanation Mode

**Voice capture**
- *Simple:* The phone listens and turns what you say into a sound file, just like a voice note.
- *Technical:* Web Audio API captures raw PCM, we downsample to 16 kHz mono and write a WAV header client-side so every browser — including iOS Safari — produces a decodable file, then base64 it to the server.
- *One-liner:* We record a clean WAV in the browser so transcription never fails on browser quirks.

**AI understanding**
- *Simple:* One AI writes down what was said, a second AI figures out which product they meant.
- *Technical:* Gemini transcription for STT, then a Flash model with a strict JSON schema that normalises brand/slang to a canonical retail name plus a category and confidence score.
- *One-liner:* Two AI stages — hear it, then normalise it — so "that blue sports drink" becomes "Blue Gatorade".

**Database**
- *Simple:* Every request is saved so the owner can see what people keep asking for.
- *Technical:* A single Postgres table with RLS, indexed on product and time; demand is an aggregation query over rows, not a maintained counter, so it can never drift.
- *One-liner:* One append-only table of requests; demand is derived, never duplicated.

**Live dashboard**
- *Simple:* The item pops up on the owner's screen the second the customer finishes speaking.
- *Technical:* Postgres logical replication via Realtime pushes change events over a websocket; the client invalidates its React Query cache and re-renders the grouped list.
- *One-liner:* Realtime websocket on the table means zero refresh for the owner.

**No auth (a decision, not an omission)**
- *Simple:* The counter tablet is shared, so asking customers to log in would kill the whole point.
- *Technical:* Anonymous writes behind RLS insert-only policies; owner actions would sit behind auth in v2.
- *One-liner:* Friction is the enemy — the whole product is "two seconds, no account".

---

## C. Codebase Map

```text
User taps mic (src/routes/index.tsx)
  -> useRecorder() records PCM, encodes WAV        src/lib/useRecorder.ts
  -> base64 payload sent to server function
     -> submitDemand handler (SERVER)              src/lib/demand.functions.ts
        -> POST /v1/audio/transcriptions   (Lovable AI, Gemini transcribe)
        -> POST /v1/chat/completions       (Lovable AI, Gemini Flash, JSON out)
        -> INSERT into public.demand_requests      Lovable Cloud Postgres
     <- { transcript, product_name, category }
  -> success card renders on the counter screen
Postgres change event -> Realtime websocket
  -> dashboard invalidates query, refetches, regroups   src/routes/dashboard.tsx
  -> owner sets status -> UPDATE row -> realtime -> all screens update
```

---

## D. Judge Q&A Prep

1. **Why voice instead of a form?** Customers are leaving the shop; typing on a stranger's tablet takes 20 seconds, speaking takes two. Zero friction is the product.
2. **Why two AI models instead of one?** Transcription and reasoning are different jobs. A dedicated speech model is more accurate and cheaper than asking one big model to do both.
3. **How does it handle Hinglish?** The transcription model auto-detects 85+ languages, and the extraction prompt explicitly expects English/Hindi/Hinglish and outputs a standard English retail name.
4. **What if the AI gets the product wrong?** We store the raw transcript alongside the AI's answer, so the owner can always see exactly what was said and correct course. We also store a confidence score.
5. **Why Postgres and not a spreadsheet or NoSQL?** Demand is an aggregation problem — "group by product, count" is one SQL line. Relational is the boring, correct tool.
6. **Why no login?** The MVP is one shared counter device plus one owner screen. Auth adds friction without adding demo value; it's a v2 item for multi-shop.
7. **Is that a security problem?** Yes, in production. Row Level Security is on, but writes are public. In v2 the counter device gets a shop token and the dashboard sits behind owner login.
8. **How would this scale to 10,000 shops?** Add a `shop_id` column and scope every policy and query to it. The AI calls are stateless, so they scale horizontally; the aggregation gets an index on `(shop_id, product_name)`.
9. **What's the cost per request?** A few seconds of audio plus a short text completion — fractions of a rupee. Batching and caching common products would cut it further.
10. **What if the internet drops mid-demo?** The recording still completes locally, and the request fails with a visible error rather than silently. There's also a typed fallback that uses the same pipeline.
11. **What if the microphone is blocked?** We detect permission failure and automatically reveal a text input that runs the identical AI pipeline — the demo never dead-ends.
12. **Hardest technical part?** Reliable audio capture. Chunked `MediaRecorder` output is headerless and iOS Safari records fragmented MP4, both of which transcription rejects — so we capture raw PCM and write our own WAV header.
13. **How do you know it works?** It was tested end to end with real speech: a spoken sentence "that blue sports drink" came back as "Blue Gatorade" and appeared on the dashboard.
14. **Why not train your own ML model?** With 24 hours and no labelled Indian retail dataset, a well-prompted general model is strictly better. Our differentiator is the workflow, not the weights.
15. **How do you prevent duplicate/spam entries?** Duplicates are the feature — 24 requests for oat milk is the signal. Spam is a real risk; rate limiting per device is a known gap.
16. **What data privacy concerns exist?** We store no customer identity — just the sentence and the product. Audio is never persisted; it's transcribed in memory and discarded.
17. **Why realtime instead of polling?** The "wow" moment is the item appearing on the owner's screen the instant the customer stops speaking. Polling would add seconds of lag.
18. **What measurable value does the merchant get?** A ranked list of lost sales they currently never learn about, with counts they can take to a distributor.
19. **What's mocked?** Nothing. Speech, AI extraction, database writes and realtime are all live. The only fixed value is the shop name in the header.
20. **What breaks if the AI provider is down?** The request errors visibly with a retry message; the typed fallback uses the same provider, so a full outage stops new requests, but the dashboard and all stored demand keep working.
21. **What would you build next with a week?** Auto-ordering to suppliers when a product crosses a threshold, and an SMS back to the customer when the item lands.
22. **What did you cut for time?** Auth, multi-shop scoping, rate limiting, and merging near-duplicate product names like "Oat Milk" vs "Oatmilk".

---

## E. Final Briefing

**30-second pitch.** Small shops lose sales they never even hear about — a customer asks for
something, it isn't there, they walk out, and the owner never learns. DemandDrop turns that
lost moment into data. The customer taps a mic at the counter and says it in their own words;
AI turns "that blue sports drink" into "Blue Gatorade" and the owner instantly sees a ranked
list of what people want but can't buy from them.

**1-minute technical.** It's a React app on TanStack Start. The browser records raw audio and
encodes a WAV, then posts it to a server function — so our AI key never touches the client.
That function runs two AI calls: Gemini transcription for speech-to-text, then a Gemini Flash
model constrained to JSON that normalises messy speech into a canonical product name,
category and confidence. The result is written as one row in a Postgres table on Lovable Cloud.
The owner dashboard subscribes to that table over Realtime, so rows appear live, and it groups
by product name to rank demand. There's a typed fallback on the same pipeline so a blocked
microphone never breaks the flow.

**3-minute architecture walkthrough.** Start at the counter screen: one big mic button with
four honest states — idle, listening, thinking, result. `useRecorder` captures PCM through the
Web Audio API rather than MediaRecorder, because MediaRecorder fragments are headerless and
Safari emits fragmented MP4 — both get rejected by transcription. We downsample to 16 kHz mono,
write a WAV header, base64 it, and call `submitDemand`. That handler is server-only; it reads
the API key from server environment variables, uploads the audio as multipart to the speech
endpoint, gets back a sentence, and passes it to the extraction model with a strict system
prompt and JSON response format. If the model can't identify a product, we return an "unclear"
state instead of writing junk. Otherwise we insert the transcript, product, category and
confidence into `demand_requests`, a single flat table with RLS enabled and GRANTs for the
counter role. Because Realtime is turned on for that table, Postgres pushes the change over a
websocket; the dashboard invalidates its React Query cache, refetches and regroups the rows by
product name, showing counts and a status control. Status updates write back to the same rows
and propagate the same way. Demand is always computed from rows, never stored as a counter,
so it can't go stale.

**User journey.** Customer can't find oat milk → taps the mic → says "I was looking for Oatly"
→ sees a confirmation card with "Oat Milk" and the exact words they said → owner's dashboard
shows "Oat Milk — 24 people asked" at the top of the list → owner sets it to "Ordering now".

**Biggest technical challenge.** Getting audio that transcription would actually accept across
browsers. Solved by bypassing MediaRecorder entirely and hand-encoding a complete 16 kHz mono
WAV from raw PCM, plus a size floor that rejects silent clips before they ever hit the API.

**Biggest limitation.** No authentication and no per-shop scoping — anyone with the URL can add
a request. Fine for an in-store tablet, not for production.

**Future improvements.** (1) Auto-ordering: when a product crosses a request threshold, place
the order with the shop's distributor automatically. (2) Notify the customer by SMS when the
item they asked for arrives. (3) Aggregate anonymised neighbourhood demand into trend data
that brands would pay for.
