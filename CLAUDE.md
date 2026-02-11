# CareCompanion AI — Project Context

## What This Is
Voice-first AI chronic care co-pilot demo for Medicare seniors with RPM (Remote Patient Monitoring) devices. Single-page demo with 3 synchronized panels showing the full product experience.

## Tech Stack
- **Next.js 14** (App Router) + Tailwind CSS + shadcn/ui
- **Neon PostgreSQL** + Drizzle ORM (`src/lib/db/`)
- **ElevenLabs Conversational AI** (voice calls via WebRTC, agent ID: `agent_8601kh042d5yf7atvdqa6nbfm9yb`)
- **Claude API** (chat, optional)
- Deployed on **Vercel** at `carecompanion.earlygod.ai`

## Auth
- HTTP Basic Auth via `src/middleware.ts` — Login: `ms` / Password: `openclaw`

## Demo Flow (7 phases)
State machine in `src/components/demo/demo-context.tsx`:
```
idle → detecting → analyzing → calling → active → documenting → complete
```
1. **idle**: All panels show baseline populated data (Margaret Chen's vitals, Epic flowsheet, patient grid)
2. **detecting**: "Run Demo" clicked → 3-day BP trend animates on phone (132→142→155), flag appears on patient grid
3. **analyzing**: User clicks flag → AI Thinking Feed shows 7-step reasoning (hero moment)
4. **calling**: AI decides to call patient → incoming call screen on phone
5. **active**: Voice conversation via ElevenLabs (or simulated fallback)
6. **documenting**: Call ends → BPA alert appears in Epic EHR
7. **complete**: Provider sees AI summary, can resolve with action pills

## Three Panels
1. **Patient View** (iPhone frame) — `src/components/demo/voice-agent.tsx` — Vitals, meds, incoming call, live conversation
2. **Clinical Intelligence** — `src/components/demo/live-triage.tsx` — Patient risk grid → AI thinking feed → transcript → completion
3. **Provider EHR (Epic)** — `src/components/demo/live-billing.tsx` — Epic-style flowsheet, BPA alerts, AI summary, provider actions

## Key Files
- `src/app/page.tsx` — Main layout, 3-panel split, header with Run Demo/Reset/Dev Logs buttons
- `src/components/demo/demo-context.tsx` — Central state: phases, transcript, logs, alerts, billing, `AI_THINKING_STEPS`
- `src/components/demo/voice-agent.tsx` — ElevenLabs voice + fallback simulated conversation
- `src/components/demo/live-triage.tsx` — Clinical Intelligence panel (patient grid + AI reasoning)
- `src/components/demo/live-billing.tsx` — Epic EHR panel (flowsheet + BPA + AI summary)
- `src/components/demo/script-guide.tsx` — Overlay telling user what to say as patient
- `src/components/demo/developer-logs.tsx` — Slide-out dev logs panel
- `src/lib/db/schema.ts` — Drizzle schema (patients, vitals, medications, alerts, billing)
- `src/middleware.ts` — Basic auth

## API Routes
- `GET /api/patients` — List patients
- `GET /api/vitals?patientId=X` — Vitals data
- `GET /api/alerts` — Alert queue
- `GET /api/medications?patientId=X` — Medications
- `GET /api/billing` — Billing entries
- `POST /api/chat` — Claude chat
- `POST /api/tts` — ElevenLabs TTS
- `GET /api/elevenlabs-signed-url` — Signed URL for ElevenLabs Conversational AI

## Seed Data
5 patients, 90 days of data. Primary demo patient: **Margaret Chen** (74, HTN + T2D + CHF). Her story: stable baseline → misses evening Lisinopril → BP escalates → AI catches it → calls her → provider resolves.

## Environment Variables
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ELEVENLABS_API_KEY` — For signed URLs + TTS (set on Vercel, empty locally)
- `ANTHROPIC_API_KEY` — Claude chat (optional)
- `NEXT_PUBLIC_APP_URL` — Base URL

## Build & Deploy
- Build: `npx next build` (API route dynamic warnings are expected/harmless)
- Deploy: `npx vercel --prod`
- Dev: `npm run dev`

## Common Patterns
- All demo state flows through `useDemo()` hook from DemoProvider context
- Panel components are phase-driven: `switch(demoPhase)` renders different views
- ElevenLabs voice: tries signed URL first → falls back to public agentId → falls back to simulated conversation
- Mic permission pre-requested during "detecting" phase for later auto-accept
- CSS animations via `<style>` blocks with `@keyframes` (no animation library)
