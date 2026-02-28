# CareCompanion — System Architecture

## End-to-End Patient Journey

```
Patient downloads iOS app
        |
        v
Apple Sign In / Register ──> JWT token issued (365-day)
        |
        v
Onboarding Profile Setup
  - GLP-1 medication, dosage, start date, injection day
  - Conditions, side effects, goals, age bracket
  - Select care coordinator (Sarah / Michael / Hope / James)
        |
        v
┌───────────────────────────────────────────────┐
│           Two Data Ingestion Paths            │
├───────────────────┬───────────────────────────┤
│  Upload Records   │  Connect Apple HealthKit  │
│  (PDF/XML/Images) │  (vitals auto-sync)       │
│  POST /health-    │  POST /api/vitals         │
│  records/upload   │  source: "apple_health"   │
│  Up to 50MB       │  Blood pressure, HR,      │
│  Multer → /uploads│  glucose, weight, O2,     │
│                   │  steps, sleep, mood, etc.  │
└─────────┬─────────┴─────────────┬─────────────┘
          |                       |
          v                       v
┌─────────────────────────────────────────────────┐
│        Gemini 2.5 Flash (Vision)                │
│  Extracts structured medical data from          │
│  PDFs/images/CCD-XML into canonical JSON:       │
│  demographics, conditions, medications,         │
│  allergies, labs, vitals, procedures,           │
│  imaging, immunizations, family/social history  │
└─────────────────────┬───────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────┐
│        Gemini 3.1 Pro — EHR Compaction          │
│  Builds 3-Tier Patient Memory:                  │
│                                                 │
│  Tier 1 (Constitutional — never expires)        │
│    Demographics, chronic conditions, allergies, │
│    family history, trust levels per source       │
│                                                 │
│  Tier 2 (Strategic — quarterly refresh)         │
│    Active meds, care plan, risk factors,        │
│    treatment goals, specialists, pipeline data  │
│                                                 │
│  Tier 3 (Operational — 90-day window)           │
│    Recent labs + trends, vital trends,          │
│    adherence rate, active symptoms              │
│                                                 │
│  Also extracts:                                 │
│    top_3_insights, care_gaps, hook_anchor       │
└─────────────────────┬───────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────┐
│         Engagement Pipeline (Onboarding)        │
│  Triggered after records processed or manually  │
│  from clinician console                         │
│                                                 │
│  Step 1: EHR Compaction (above)                 │
│  Step 2: First Call Prep (dual-agent, below)    │
│  Step 3: Trigger Generation (48h sequence)      │
│  Step 4: Outbound Call or In-App Nudge          │
└─────────────────────┬───────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────────────────┐
│              Dual-Agent Script Negotiation                   │
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │  Gemini 3.1 Pro     │    │  Claude Sonnet 4.6          │ │
│  │  (Generator)        │    │  (Judge — Extended Thinking) │ │
│  │                     │    │                             │ │
│  │  Receives:          │    │  Independent evaluator.     │ │
│  │  - Patient memory   │    │  Never sees generator       │ │
│  │  - Hook anchor      │    │  instructions.              │ │
│  │  - Care gaps        │    │                             │ │
│  │  - Skill doc        │    │  100K thinking budget.      │ │
│  │  - Judge critique   │    │  Streams thinking tokens    │ │
│  │    (on revisions)   │    │  for live progress.         │ │
│  │                     │    │                             │ │
│  │  Generates:         │    │  Scores on 8 dimensions     │ │
│  │  - Opening script   │    │  (0-5 each, /40 total):    │ │
│  │  - Hook candidates  │    │  Personal Relevance,        │ │
│  │    (positive +      │    │  Curiosity/Tension,         │ │
│  │     negative)       │    │  Emotional Safety,          │ │
│  │  - Conversation     │    │  Speed to Client Talking,   │ │
│  │    flow (5 phases)  │    │  Clarity of Today's Win,    │ │
│  │  - Talking points   │    │  Agency/Choice,             │ │
│  │  - Anticipated      │    │  Energy/Voice,              │ │
│  │    responses        │    │  Brevity/Cognitive Load     │ │
│  │  - Hooks for future │    │                             │ │
│  │  - Notes for next   │    │  + 6 quality checks         │ │
│  │    call             │    │  + 5 failure mode detectors │ │
│  └─────────┬───────────┘    └──────────────┬──────────────┘ │
│            │                               │                │
│            └───────── Loop ────────────────┘                │
│              Up to 5 iterations                             │
│              Threshold: 36/40 (90%)                         │
│              Critique fed back to Gemini on failure         │
└─────────────────────────┬───────────────────────────────────┘
                          |
                          v
┌─────────────────────────────────────────────────┐
│     Trigger Engine       │
│     (Gemini 2.0 Flash)                          │
│                                                 │
│  +5 min    health_story    Hunt (curiosity)     │
│  +2h/4h/6h health_insight  Hunt (top insights)  │
│  +12h/18h  overdue_care    External (care gaps)  │
│  +36h      ask_your_doctor Investment (Qs)       │
│                                                 │
│  Respects quiet hours (22:00-07:00)             │
│  Delivered via APNs push + in-app message       │
└─────────────────────┬───────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────┐
│           Voice Call System                      │
│                                                 │
│  AI-Initiated (outbound):                       │
│    ElevenLabs Conversational AI + Twilio        │
│    Dials patient's phone number                 │
│    Dynamic variables from first-call prep:      │
│    opening_script, hook_anchor, talking_points   │
│                                                 │
│  Patient-Initiated (in-app):                    │
│    Signed ElevenLabs JWT → iOS @11labs/client   │
│    Direct browser-to-ElevenLabs connection      │
│                                                 │
│  4 coordinator personas with unique voices:     │
│    Sarah, Michael, Hope, James                  │
└─────────────────────┬───────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────┐
│        Ongoing Autonomous Engagement            │
│                                                 │
│  Hourly Monologue (Gemini 2.0 Flash):           │
│    Every 60 min per active patient              │
│    OBSERVE → THINK → ACT                        │
│    Actions: message, call, trigger, escalate    │
│    Uses full compacted context + GLP-1 clinical │
│    knowledge + Hook Model classification        │
│                                                 │
│  Scheduled Actions (every 1 min):               │
│    Med reminders, hydration nudges, check-ins   │
│    Context-aware: skips if already done          │
│    Content generated by Gemini 2.0 Flash        │
│                                                 │
│  Trigger Delivery (every 1 min):                │
│    Fires due triggers → APNs + in-app           │
│    Quiet hours enforcement                      │
└─────────────────────────────────────────────────┘
```

---

## Clinician Console

```
Vercel (Next.js 14) ──── API ────> Railway (Express)
carecompanion.earlygod.ai          carecompanion-backend-production.up.railway.app

Console Features:
  /console              Dashboard — stats overview
  /console/ehr          Patient EHR — charts, timeline, monologue, preferences
  /console/pipeline     Live pipeline view — real-time event streaming (2s poll)
                        Agent negotiation side-by-side with thinking traces
                        Score bars for all 8 rubric dimensions
  /console/monologue    AI reasoning log — observation/reasoning/assessment
  /console/calls        Voice session history
  /console/analytics    Engagement analytics

  Actions: Send message, push notification, request call,
           upload records on behalf of patient, trigger pipeline
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| iOS App | Swift / SwiftUI | Patient-facing mobile app |
| Frontend | Next.js 14, Tailwind, Radix UI, Recharts | Clinician console |
| Backend | Express.js (Node) | API server, cron jobs, WebSocket |
| Database | Neon PostgreSQL (serverless) + Drizzle ORM | All persistent data |
| EHR Extraction | Gemini 2.5 Flash (Vision) | Parse PDFs, images, CCD/XML |
| Memory Compaction | Gemini 3.1 Pro Preview | Build 3-tier patient memory |
| Script Generation | Gemini 3.1 Pro Preview | First-call prep (generator agent) |
| Script Judging | Claude Sonnet 4.6 (Extended Thinking) | First-call prep (judge agent) |
| Autonomous Brain | Gemini 2.0 Flash | Hourly monologue, triggers, scheduled actions |
| Voice (Inbound) | ElevenLabs Conversational AI | In-app voice calls |
| Voice (Outbound) | ElevenLabs + Twilio | AI-initiated phone calls |
| Push Notifications | APNs (HTTP/2 direct) | iOS push delivery |
| Auth | JWT + Apple Sign In | Patient and admin auth |
| Encryption | AES (PII fields) | HIPAA-aligned data protection |
| Hosting | Railway (backend), Vercel (frontend) | Deployment |

---

## Data Model (Key Tables)

| Table | Role |
|-------|------|
| `users` | Patient accounts, encrypted PII, GLP-1 profile |
| `patient_memory` | 3-tier compacted memory (tier1/tier2/tier3), pipeline runs, first-call prep |
| `health_records` | Uploaded files + extracted structured data |
| `vitals` | HealthKit synced + manual readings |
| `medications` / `medication_logs` | Active meds + adherence tracking |
| `messages` | In-app messages (patient + coordinator) |
| `ai_actions` | Every monologue decision with full reasoning chain |
| `triggers` | Scheduled engagement touchpoints |
| `voice_sessions` | Call logs (inbound + outbound) |
| `push_tokens` | APNs device tokens |
| `user_coordinator` | Patient ↔ coordinator assignment |
| `escalations` | Provider/emergency escalation records |
