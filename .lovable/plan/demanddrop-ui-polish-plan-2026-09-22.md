# DemandDrop UI polish plan

## Direction
Use a restrained cyber-utility aesthetic: deep neutral surfaces, electric cyan for live activity, green for successful stock actions, amber for attention, and strong typographic contrast. Preserve DemandDrop’s voice-first simplicity and show only real data—no fabricated counters, charts, system claims, or decorative glass effects.

## Phase checkpoints
1. **Foundation and hierarchy**
   - Update semantic tokens, typography, focus states, reduced-motion behavior, and shared surface styling.
   - Tighten the counter screen’s desktop composition while keeping the microphone as the dominant action.
   - Make the dashboard clearly read as a live, ranked demand feed.
   - Verify diagnostics and capture exact diffs.

2. **Core demo flow and states**
   - Make the progression obvious: speak → AI understands → request saved → owner sees ranked demand.
   - Improve contextual processing, success, unclear, and error presentations.
   - Add retry actions using the existing submission flow only.
   - Keep typed input as the reliable venue fallback.
   - Verify diagnostics and capture exact diffs.

3. **Dashboard clarity and responsiveness**
   - Remove the duplicated status badge and keep one polished status control.
   - Emphasize the top-ranked real request and add a subtle live-refresh signal.
   - Recompose phone rows so product names, counts, categories, and controls remain readable.
   - Verify desktop, tablet, mobile, keyboard navigation, and capture exact diffs.

4. **Polish, documentation, and full verification**
   - Add only purposeful press, recording, and result transitions.
   - Audit consistency, accessibility, performance, metadata, and the logic boundary.
   - Run the complete real voice-to-dashboard journey and inspect browser/network errors.
   - Write `audit/UI_POLISH_REPORT.md` and `audit/DEMO_SCRIPT.md`.
   - Provide a phase-by-phase diff summary and final verification evidence.

## Technical boundaries
- No database, AI prompt, server function, API, authentication, recording, or data-flow changes.
- No new dependencies, large assets, extra API calls, fake progress, fake metrics, or decorative charts.
- Changes are limited to `src/styles.css`, the two route presentations, existing UI primitives only when needed, root metadata cleanup, and the two requested audit documents.
- Existing real loading, error, empty, voice, typed fallback, status update, and polling behavior remain functional.

## Rollback and proof
The environment manages Git state and forbids branch/commit operations, so no manual branch or commits will be created. Each phase will remain a small reviewable change set, with exact file diffs, diagnostics, responsive screenshots, and end-to-end evidence serving as reversible checkpoints.
