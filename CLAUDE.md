# CareCompanion AI — Project Context

## What This Is
Voice-first AI GLP-1 patient engagement platform demo for Medicare seniors. Single-page demo with 3 synchronized panels showing a **7-day Wegovy initiation simulation** — click through each day to see how AI maintains patient engagement during the critical first week of GLP-1 therapy.

**Thesis**: Medicare is about to onboard 30M+ seniors onto GLP-1s via the BALANCE model (July 2026). GLP-1s only work with sustained engagement — nobody is building the engagement layer. This demo shows how AI catches nausea-driven disengagement and re-engages patients before they discontinue.

## Tech Stack
- **Next.js 14** (App Router) + Tailwind CSS + shadcn/ui
- **Neon PostgreSQL** + Drizzle ORM (`src/lib/db/`)
- **ElevenLabs Conversational AI** (voice calls via WebRTC, agent ID: `agent_8601kh042d5yf7atvdqa6nbfm9yb`)
- **Claude API** (chat, optional)
- Deployed on **Vercel** at `carecompanion.earlygod.ai`

## Auth
- HTTP Basic Auth via `src/middleware.ts` — Login: `ms` / Password: `openclaw`

## 7-Day Simulation + State Machine
Two state dimensions in `src/components/demo/demo-context.tsx`:

1. **`currentDay`** (0-7): Which day of the Wegovy journey we're viewing
2. **`demoPhase`**: `idle → detecting → analyzing → calling → active → documenting → complete`

How they interact:
- **Day 0**: Idle, "Start Day 1" button
- **Days 1-3, 5-7**: `demoPhase = "idle"`, panels show that day's vitals/messages
- **Day 4 (INCIDENT)**: `advanceDay()` triggers `demoPhase = "detecting"` → full AI incident flow kicks in
- **After Day 4 complete**: advances to Day 5, `demoPhase` resets to idle
- **Day 7**: Weekly summary visible, "Reset" button

### 7-Day Clinical Timeline (Margaret Chen, 72F, BMI 34, Wegovy 0.25mg)
| Day | Weight | Nausea | Engagement | Key Event |
|-----|--------|--------|------------|-----------|
| 1 | 247.2 | None | 92% | First injection, AI welcome |
| **2** | **247.0** | **Mild** | **85%** | **Proactive check-in voice call (trust building)** |
| 3 | 246.4 | Moderate | 60% | Reduced intake, hydration coaching |
| **4** | **246.0** | **Moderate** | **41%** | **Missed check-in → AI thinking → voice call → Epic BPA** |
| 5 | 246.1 | Mild | 78% | Post-call recovery |
| 6 | 245.9 | None | 88% | Symptoms resolving |
| 7 | 245.6 | None | 94% | Weekly summary, -1.6 lbs |

## Three Panels
1. **Patient View** (iPhone frame) — `src/components/demo/voice-agent.tsx` — iOS text notifications, daily vitals card, Day 2 proactive call, Day 4 incident call, simulated conversation with TTS audio
2. **Clinical Intelligence** — `src/components/demo/live-triage.tsx` — GLP-1 patient cohort grid → AI thinking feed (Day 4) → transcript → completion + Day 7 Program ROI card
3. **Provider EHR (Epic)** — `src/components/demo/live-billing.tsx` — Dynamic flowsheet (grows per day), medications (Wegovy/Metformin/Lisinopril), BPA alerts, AI summary, Day 7 clinical summary

## Key Files
- `src/app/page.tsx` — Main layout, 3-panel split, header with 7-day stepper + day indicator pills
- `src/components/demo/demo-context.tsx` — Central state: `currentDay`, `demoPhase`, `DAY_DATA`, `AI_THINKING_STEPS`, transcript, billing
- `src/components/demo/voice-agent.tsx` — iOS text notifications + daily vitals card + simulated voice calls (Day 2 check-in, Day 4 incident) with TTS audio
- `src/components/demo/live-triage.tsx` — GLP-1 patient cohort grid + AI reasoning feed + documenting/complete views
- `src/components/demo/live-billing.tsx` — Epic EHR: dynamic flowsheet, medications, problems, BPA, AI summary, Day 7 weekly summary
- `src/components/demo/script-guide.tsx` — Conversation Preview overlay (dynamic Day 2/Day 4 content, no mic needed)
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

## Clinical Content
- **Patient**: Margaret Chen, 72F, BMI 34, T2D + Obesity + HTN
- **Medications**: Wegovy 0.25mg SubQ weekly, Metformin 1000mg BID, Lisinopril 20mg daily
- **Problems**: Obesity E66.01, T2D E11.9, HTN I10, GLP-1 Monitoring Z79.899
- **Billing**: CPT 99457 (RPM $54), 99490 (CCM $64), 99453 (device setup $21), 99454 (device supply $55)
- **AI Thinking Steps** (Day 4): engagement pattern → GI symptoms → drug interactions → cohort analysis → dehydration risk → provider protocol → decision to call
- **Day 4 Call Script**: AI calls about missed check-in + nausea → patient says "almost quit" → AI normalizes + tips (ginger, small meals, hydration) → patient re-engages

## Seed Data
5 patients, 90 days of data. Primary demo patient: **Margaret Chen**. Her GLP-1 story: starts Wegovy → nausea builds → engagement drops → AI catches missed check-in on Day 4 → voice call re-engages her → provider gets summary with action recommendations.

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
- `currentDay` drives which day's data is shown; `demoPhase` drives the Day 4 AI incident flow
- Day 2: `advanceDay()` schedules `demoPhase("calling")` after 5.5s delay (text notification plays first)
- Day 4: `advanceDay()` sets `demoPhase("detecting")` → full AI incident flow
- Panel components read `currentDay` from context to render day-appropriate content
- `DAY_DATA` is a static 7-element array with `isCallDay` flag — no API/DB needed
- VoiceAgent remounts per day via React `key={currentDay}` for clean state reset
- iOS text notifications slide down from top on each day (except Day 4, empty phoneMessage)
- Voice calls are fully simulated: async sequential script with audio fallback chain (ElevenLabs TTS → SpeechSynthesis → silent)
- Day 2 proactive call uses `completeProactiveCall()` (returns to idle, no BPA/documenting)
- Day 4 incident call uses `completeCall()` (triggers documenting → complete flow)
- Revenue math lives in Clinical Intelligence panel (ProgramROI card, Day 7 only), NOT in EHR
- Dynamic flowsheet in Epic panel grows columns as days advance
- CSS animations via `<style>` blocks with `@keyframes` (no animation library)
