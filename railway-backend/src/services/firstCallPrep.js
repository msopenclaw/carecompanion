const { eq } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk");
const { db } = require("../db");
const { patientMemory, userProfiles } = require("../db/schema");
const { getCompactedContext } = require("./ehrCompaction");
const { decrypt } = require("./encryption");
const { emitPipelineEvent } = require("./pipelineEmitter");

const MAX_ITERATIONS = 5;
const MIN_SCORE = 32; // out of 40 (80% bar)

/**
 * prepareFirstCall — Dual-agent first-call script generation with pipeline logging.
 *
 * Agent 1 (Gemini 3.1 Pro): Generates the opening script + hooks using the
 *   "Health Coach Call Openings That Hook" skill document.
 * Agent 2 (Claude Sonnet 4.6): Independent judge that evaluates the script against
 *   the Hook Opener Rubric (8 dimensions, 0-5 each, total /40). Truly objective —
 *   the judge is never told to be lenient, never sees generator instructions,
 *   and is explicitly instructed to find faults.
 *
 * The two agents negotiate: if the judge scores below 32/40 (80%), the generator
 * gets the judge's full critique and must rework. This continues up to 5 iterations
 * until the judge is satisfied.
 *
 * All steps are logged with full verbosity to pipeline_log for console display.
 */
async function prepareFirstCall(userId) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("No GEMINI_API_KEY");

  const pipelineLog = [];
  const logEvent = async (step, status, detail) => {
    const event = { step, status, timestamp: new Date().toISOString(), ...detail };
    pipelineLog.push(event);
    console.log(`[FIRST_CALL_PREP] [${step}] ${status}: ${JSON.stringify(detail)}`);
    // Emit to SSE listeners instantly (before DB write)
    emitPipelineEvent(userId, event);
    // Immediately persist to DB so the console UI can poll and display progress
    try {
      const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
      if (mem) {
        const tier2 = mem.tier2 || {};
        const runs = tier2.pipeline_runs || [];
        if (runs.length > 0) {
          const latestRun = runs[runs.length - 1];
          latestRun.events = [...(latestRun.events || []), event];
          tier2.pipeline_runs = runs;
          tier2.pipeline_log = latestRun.events;
          await db.update(patientMemory).set({ tier2, updatedAt: new Date() })
            .where(eq(patientMemory.userId, userId));
        }
      }
    } catch (e) {
      console.error("[FIRST_CALL_PREP] Failed to persist event:", e.message);
    }
  };

  // ── Load patient context ──
  await logEvent("load_context", "running", {
    detail: "Loading patient data and compacted memory",
    maxIterations: MAX_ITERATIONS,
    minScore: `${MIN_SCORE}/40 (80%)`,
  });
  const compactedCtx = await getCompactedContext(userId);
  const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

  if (!profile) throw new Error("No profile found");

  const firstName = decrypt(profile.firstName);
  const hookAnchor = mem?.rawRecords?.hook_anchor || null;
  const careGaps = mem?.rawRecords?.care_gaps || [];
  const insights = mem?.rawRecords?.top_3_insights || [];

  let currentFocus = "general health and medication management";
  if (careGaps.length > 0) {
    const topGap = [...careGaps].sort((a, b) => {
      const ord = { high: 0, medium: 1, low: 2 };
      return (ord[a.urgency] || 2) - (ord[b.urgency] || 2);
    })[0];
    currentFocus = topGap.description;
  } else if (profile.glp1Medication) {
    currentFocus = `medication adherence and wellness (currently on ${profile.glp1Medication})`;
  }

  await logEvent("load_context", "completed", {
    patientName: firstName,
    hasCompactedMemory: !!compactedCtx,
    hookAnchor: hookAnchor || "default",
    currentFocus,
    insightsCount: insights.length,
    insights,
    careGapsCount: careGaps.length,
    careGaps,
    compactedContextPreview: compactedCtx ? compactedCtx.substring(0, 500) + "..." : null,
  });

  const patientContext = buildPatientContext(firstName, compactedCtx, hookAnchor, currentFocus, insights, careGaps);

  // ── Agent 1: Gemini — Script Generator ──
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  // ── Agent 2: Claude — Script Judge ──
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const hasJudge = !!ANTHROPIC_API_KEY;
  let claude = null;
  if (hasJudge) {
    claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    await logEvent("agents_init", "completed", {
      generator: "gemini-3-flash-preview",
      judge: "claude-sonnet-4-6",
      mode: "dual-agent adversarial",
      detail: "Judge is fully independent — uses the Hook Opener Rubric (8 dimensions, 0-5 each, /40). Generator never sees rubric scoring logic. Judge is instructed to be strict and find faults.",
    });
  } else {
    await logEvent("agents_init", "completed", {
      generator: "gemini-3-flash-preview",
      judge: null,
      mode: "single-pass (no ANTHROPIC_API_KEY)",
    });
  }

  let bestPrep = null;
  let bestScore = 0;
  let judgeFeedback = null;
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations = i + 1;

    try {
    // ── Step 1: Gemini generates the script ──
    await logEvent("script_generation", "running", {
      iteration: iterations,
      isRevision: i > 0,
      previousScore: judgeFeedback ? `${judgeFeedback.total_score}/40` : null,
      detail: i === 0
        ? "Generating opening script from patient context using Health Coach Hook skill"
        : `Revision #${i} — reworking based on judge critique (previous: ${judgeFeedback?.total_score}/40, need ${MIN_SCORE}/40)`,
    });

    const generatorPrompt = buildGeneratorPrompt(patientContext, judgeFeedback, i);
    const genStart = Date.now();
    const genHeartbeat = setInterval(async () => {
      const elapsed = Math.round((Date.now() - genStart) / 1000);
      await logEvent("script_generation", "running", {
        detail: `Gemini generating${i > 0 ? ` revision #${i}` : " initial script"}... (${elapsed}s elapsed)`,
        iteration: iterations,
        elapsedSeconds: elapsed,
      });
    }, 8000);

    let genResult;
    try {
      const streamResult = await gemini.generateContentStream({
        contents: [{ role: "user", parts: [{ text: generatorPrompt }] }],
        generationConfig: { maxOutputTokens: 65536, responseMimeType: "application/json" },
      });

      // Stream token deltas to SSE listeners, buffered at ~500ms intervals
      let fullText = "";
      let lastDeltaEmit = Date.now();
      for await (const chunk of streamResult.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullText += chunkText;
          const now = Date.now();
          if (now - lastDeltaEmit > 500) {
            emitPipelineEvent(userId, {
              step: "script_generation",
              status: "streaming",
              timestamp: new Date().toISOString(),
              iteration: iterations,
              partial_text: fullText,
              type: "token_delta",
            });
            lastDeltaEmit = now;
          }
        }
      }
      genResult = await streamResult.response;
    } finally {
      clearInterval(genHeartbeat);
    }
    const genDuration = Date.now() - genStart;

    // Capture Gemini thinking if available
    let geminiThinking = null;
    try {
      const parts = genResult.candidates?.[0]?.content?.parts || [];
      const thoughtParts = parts.filter(p => p.thought);
      if (thoughtParts.length > 0) {
        geminiThinking = thoughtParts.map(p => p.text).join("\n");
      }
    } catch { /* no thinking available */ }

    let prep;
    try {
      prep = JSON.parse(genResult.text());
    } catch {
      await logEvent("script_generation", "error", {
        iteration: iterations,
        error: "Gemini JSON parse failed",
        geminiThinking,
        durationMs: genDuration,
      });
      continue;
    }

    await logEvent("script_generation", "completed", {
      iteration: iterations,
      hookAnchor: prep.hook_anchor,
      openingScript: prep.opening_script,
      scriptPreview: prep.opening_script?.substring(0, 120) + "...",
      talkingPoints: prep.talking_points,
      followUpQuestion: prep.follow_up_question,
      hookCandidatesCount: prep.hook_candidates?.length || 0,
      conversationPhases: prep.conversation_flow?.length || 0,
      anticipatedResponses: prep.anticipated_responses?.length || 0,
      futureHooksCount: prep.hooks_for_future_calls?.length || 0,
      geminiThinking,
      durationMs: genDuration,
    });

    // If no judge, accept first generation
    if (!hasJudge) {
      bestPrep = prep;
      bestScore = prep.rubric_score?.total || 30;
      await logEvent("script_accepted", "completed", {
        iteration: iterations,
        score: bestScore,
        maxScore: 40,
        reason: "single-pass mode (no judge available)",
      });
      break;
    }

    // ── Step 2: Claude judges the script ──
    await logEvent("judge_evaluation", "running", {
      iteration: iterations,
      model: "claude-sonnet-4-6",
      detail: "Independent evaluation against Hook Opener Rubric — 8 dimensions scored 0-5, total /40. Judge has NOT seen the generator's instructions and is explicitly told to find faults.",
      rubricDimensions: [
        "Personal Relevance",
        "Curiosity / Tension",
        "Emotional Safety + Trust",
        "Speed to Client Talking",
        "Clarity of Today's Win",
        "Agency + Choice",
        "Energy + Voice",
        "Brevity / Cognitive Load",
      ],
    });

    const judgeStart = Date.now();
    const judgeResult = await judgeScript(claude, prep, patientContext, logEvent, userId);
    const judgeDuration = Date.now() - judgeStart;

    const scorePercentage = Math.round((judgeResult.total_score / 40) * 100);

    await logEvent("judge_evaluation", "completed", {
      iteration: iterations,
      totalScore: judgeResult.total_score,
      maxScore: 40,
      percentage: `${scorePercentage}%`,
      threshold: `${MIN_SCORE}/40 (80%)`,
      passed: judgeResult.total_score >= MIN_SCORE,
      dimensions: judgeResult.dimensions,
      qualityChecks: judgeResult.quality_checks || null,
      failureModes: judgeResult.failure_modes_detected || null,
      overallFeedback: judgeResult.overall_feedback,
      specificImprovements: judgeResult.specific_improvements,
      claudeThinking: judgeResult.claudeThinking || null,
      judgeReasoning: judgeResult.reasoning_summary || null,
      durationMs: judgeDuration,
    });

    if (judgeResult.total_score > bestScore) {
      bestPrep = prep;
      bestScore = judgeResult.total_score;
      bestPrep.judge_evaluation = judgeResult;
    }

    if (judgeResult.total_score >= MIN_SCORE) {
      await logEvent("script_accepted", "completed", {
        iteration: iterations,
        score: judgeResult.total_score,
        maxScore: 40,
        percentage: `${scorePercentage}%`,
        reason: `Score ${judgeResult.total_score}/40 (${scorePercentage}%) >= threshold ${MIN_SCORE}/40 (80%)`,
        finalScript: bestPrep.opening_script,
        finalHookAnchor: bestPrep.hook_anchor,
        finalTalkingPoints: bestPrep.talking_points,
        finalFollowUp: bestPrep.follow_up_question,
        hookCandidates: bestPrep.hook_candidates || [],
        conversationFlow: bestPrep.conversation_flow || [],
        anticipatedResponses: bestPrep.anticipated_responses || [],
        hooksForFutureCalls: bestPrep.hooks_for_future_calls || [],
        notesForNextCall: bestPrep.notes_for_next_call || null,
      });
      break;
    }

    // Below threshold — feed Claude's critique back to Gemini for rework
    judgeFeedback = judgeResult;
    const weakDims = judgeResult.dimensions
      ?.filter(d => d.score < 4)
      ?.map(d => `${d.name}: ${d.score}/5 — ${d.feedback}`) || [];

    await logEvent("revision_requested", "completed", {
      iteration: iterations,
      score: judgeResult.total_score,
      maxScore: 40,
      percentage: `${scorePercentage}%`,
      reason: `Score ${judgeResult.total_score}/40 (${scorePercentage}%) < threshold ${MIN_SCORE}/40 (80%) — judge rejected, sending critique back to generator`,
      weakDimensions: weakDims,
      overallFeedback: judgeResult.overall_feedback,
      specificImprovements: judgeResult.specific_improvements,
      qualityChecksFailed: judgeResult.quality_checks?.filter(c => !c.passed)?.map(c => c.check) || [],
      failureModesDetected: judgeResult.failure_modes_detected || [],
      fullDimensionFeedback: judgeResult.dimensions
        ?.map(d => `${d.name}: ${d.score}/5 — ${d.feedback}`)
        .join("\n"),
      negotiationNote: iterations < MAX_ITERATIONS
        ? `Generator will receive this critique and attempt revision #${iterations}. ${MAX_ITERATIONS - iterations} attempts remaining.`
        : "Final attempt reached — will use best score so far.",
    });

    } catch (iterErr) {
      console.error(`[FIRST_CALL_PREP] Iteration ${iterations} error:`, iterErr.message);
      await logEvent("iteration_error", "error", {
        iteration: iterations,
        error: iterErr.message,
        detail: `Iteration ${iterations} failed — continuing with best score so far (${bestScore}/40)`,
      });
      // Continue to next iteration or fall through to fallback
    }
  }

  // Fallback if nothing worked
  if (!bestPrep) {
    bestPrep = {
      opening_script: `Hey ${firstName} — thanks for signing up. I've been looking at your profile, and I'd love to chat about how things are going. What's been the biggest challenge so far?`,
      hook_anchor: "medication adherence",
      talking_points: ["Current medication regimen", "Side effects management", "Daily routine integration"],
      follow_up_question: "What's been the biggest challenge — remembering to take it, dealing with side effects, or fitting it into your routine?",
    };
    await logEvent("fallback_used", "completed", {
      reason: `All ${MAX_ITERATIONS} iterations failed to meet threshold — using fallback script`,
      bestScoreAchieved: `${bestScore}/40`,
    });
  }

  // Store result
  bestPrep.prepared_at = new Date().toISOString();
  bestPrep.judge_score = bestScore;
  bestPrep.judge_score_max = 40;
  bestPrep.judge_score_percentage = Math.round((bestScore / 40) * 100);
  bestPrep.iterations = iterations;

  // Note: pipeline_complete is logged by the wrapper (onboardingPipeline.js), not here

  // Save first_call_prep result to patient_memory
  // Events are already persisted in real-time by logEvent — only save the prep result here
  const [currentMem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  if (currentMem) {
    const tier2 = currentMem.tier2 || {};
    tier2.first_call_prep = bestPrep;
    await db.update(patientMemory).set({
      tier2,
      updatedAt: new Date(),
    }).where(eq(patientMemory.userId, userId));
  } else {
    await db.insert(patientMemory).values({
      userId,
      tier2: { first_call_prep: bestPrep },
    });
  }

  console.log(`[FIRST_CALL_PREP] Final for ${userId}: score=${bestScore}/40, iterations=${iterations}`);
  return bestPrep;
}

// ---------------------------------------------------------------------------
// Build patient context string (shared between generator and judge)
// ---------------------------------------------------------------------------

function buildPatientContext(firstName, compactedCtx, hookAnchor, currentFocus, insights, careGaps) {
  return `Patient: ${firstName}
${compactedCtx || "No detailed health records available yet."}

Hook Anchor (most interesting detail): ${hookAnchor || "Their current medication regimen and adherence patterns"}
Current Focus: ${currentFocus}
Top Insights: ${insights.length > 0 ? insights.map((ins, i) => `${i + 1}. ${ins}`).join("\n") : "No specific insights yet."}
Care Gaps: ${careGaps.length > 0 ? careGaps.map(g => `[${g.urgency}] ${g.description}`).join("; ") : "None identified"}`;
}

// ---------------------------------------------------------------------------
// Agent 1: Gemini — Script Generator Prompt
// ---------------------------------------------------------------------------

function buildGeneratorPrompt(patientContext, judgeFeedback, iteration) {
  let prompt = `You are a health coach preparing a personalized call opening.

## Skill: Health Coach Call Openings That Hook

Generate a SHORT opening script (2-3 sentences, under 20 seconds read aloud) for a health coaching call.

## Patient Context
${patientContext}

## HARD CONSTRAINTS — violating ANY of these means automatic failure

1. **MAX 2-3 SENTENCES for the opening_script.** Count them. If you wrote more than 3 sentences, delete until you have 3.
2. **EXACTLY ONE health detail from the patient's record.** Not two. Not three. ONE. Pick the most surprising or personally relevant one. Save everything else for talking_points.
3. **The question MUST appear in sentence 2 or 3.** The patient must be invited to speak within 15 seconds.
4. **MAX 50 WORDS total for the opening_script.** Count them. If you're over 50, cut ruthlessly.
5. **Name a concrete win with a timeframe.** Not "let's explore" or "get a next step." Say "4-week experiment" or "one change this week" or "a 2-week test."
6. **No medical jargon in the opener.** No "transaminases," "ALT," "Fibroscan," "radiculopathy." Use plain words the patient would use. Save clinical terms for talking_points.

## How to write it

Step 1: Pick ONE anchor detail — the single most interesting thing in their record.
Step 2: Reframe it as a contrast or surprise (not scary).
Step 3: Ask a simple A or B question immediately.
Step 4: Count your words. If over 50, cut. Count your sentences. If over 3, cut.

## Example (notice: 2 sentences, 38 words, question in sentence 2)

"Hey [name], I noticed something cool in your labs — [one surprise detail]. If we ran a quick 4-week experiment on that, would you rather focus on [option A] or [option B]?"

## What NOT to do (these patterns have failed every time)

- DON'T mention 2-3 health topics in the opener (e.g., A1c AND liver AND knee). Pick ONE.
- DON'T write compound sentences with em-dashes and sub-clauses. Keep it simple.
- DON'T frame scheduling an appointment as a "win." A win is a health outcome or personal experiment.
- DON'T add filler like "I've been looking at your latest labs and..." — get to the point.
- DON'T explain the anchor's medical significance in the opener. Create curiosity, don't resolve it.

## Use plain language
- Use the medication's brand name (e.g., "Wegovy") or say "your medication" — never use drug class terms like "GLP-1" or "semaglutide".
- This is a general health care coordinator, not a medication-specific agent.

## Scoring Rubric (your script will be judged on these 8 dimensions, each 0-5, total /40 — you need ${MIN_SCORE}/40 to pass)

1. **Personal Relevance** — ONE specific detail from the patient's actual health history. The patient thinks "they read my chart."
2. **Curiosity / Tension** — A genuine "wait, what?" moment. NOT alarm or anxiety. Leave the mystery open — don't explain it.
3. **Emotional Safety + Trust** — Collaborative, zero judgment, "we" language.
4. **Speed to Client Talking** — Patient speaks within 1-2 sentences (10-15 seconds). THIS IS CRITICAL. Scripts that make the patient wait longer than 15 seconds FAIL.
5. **Clarity of Today's Win** — One concrete goal with a timeframe. "4-week experiment," "one lever this week." NOT "get a next step" or "schedule something."
6. **Agency + Choice** — Clear A/B/C options. Patient chooses.
7. **Energy + Voice** — Human, confident, lightly playful. Not a chatbot or doctor.
8. **Brevity / Cognitive Load** — One idea, one hook, one question. Under 20 seconds. THIS IS CRITICAL. Scripts over 50 words FAIL.

## Quality Checks (your output must pass ALL)
- EXACTLY one anchor detail (not two, not three — ONE)
- Question appears in sentence 2 or 3
- Opening script is 50 words or fewer
- No alarm language
- A concrete win with a timeframe is named
- Under 20 seconds when read aloud`;

  if (judgeFeedback && iteration > 0) {
    prompt += `

## CRITICAL: REVISION REQUIRED — Attempt #${iteration + 1}

An independent quality judge scored your previous attempt ${judgeFeedback.total_score}/40 (need ${MIN_SCORE}/40 to pass).

Here is their detailed critique — you MUST address EVERY weak dimension:

${judgeFeedback.dimensions.map(d =>
  `${d.name}: ${d.score}/5 — ${d.feedback}`
).join("\n")}

Overall feedback: ${judgeFeedback.overall_feedback}

Specific improvements the judge requires: ${judgeFeedback.specific_improvements}`;

    // Include quality check failures if available
    const failedChecks = judgeFeedback.quality_checks?.filter(c => !c.passed);
    if (failedChecks?.length > 0) {
      prompt += `

Quality checks you FAILED:
${failedChecks.map(c => `- ${c.check}: ${c.detail}`).join("\n")}`;
    }

    // Include failure modes detected
    if (judgeFeedback.failure_modes_detected?.length > 0) {
      prompt += `

Failure modes the judge detected in your script:
${judgeFeedback.failure_modes_detected.map(f => `- ${f}`).join("\n")}`;
    }

    prompt += `

Generate a substantially DIFFERENT and BETTER version. Don't just tweak words — rethink the approach if needed. The judge is strict and independent.`;
  }

  prompt += `

Return JSON with this EXPANDED structure — we need a full conversation plan, not just an opener:
{
  "opening_script": "The exact 30-second opening script to read (address patient by first name). This is the hook.",
  "hook_anchor": "The one detail you anchored on for the opening",
  "hook_candidates": [
    {
      "hook": "A specific hook angle or detail from their records",
      "type": "positive|negative",
      "strength": "strong|medium|weak",
      "why": "Why this hook works (or doesn't) for this patient",
      "when_to_use": "When in the conversation or in future calls to deploy this hook"
    }
  ],
  "conversation_flow": [
    {
      "phase": "opening|discovery|deepening|action_planning|close",
      "script": "What to say in this phase",
      "purpose": "Why this phase matters",
      "patient_signals_to_listen_for": ["What the patient might say that tells you to proceed or pivot"],
      "pivot_if": "What to do if the patient isn't responding well to this phase"
    }
  ],
  "talking_points": ["5-8 follow-up insights to weave naturally into the conversation"],
  "follow_up_question": "The easy question at the end of the opener (preferably multiple choice A/B/C)",
  "anticipated_responses": [
    {
      "patient_says": "What the patient might say",
      "coach_responds": "How to respond",
      "emotional_tone": "What emotion to match"
    }
  ],
  "hooks_for_future_calls": [
    {
      "hook": "A hook to save for call #2 or later",
      "why_not_now": "Why this is better saved for later",
      "ideal_timing": "When to use this (e.g., 'after rapport is built', 'once they mention side effects')"
    }
  ],
  "notes_for_next_call": "What to remember, observe, and follow up on in the next call. What worked, what to avoid. Key patient cues to track."
}

IMPORTANT: Generate at least 4-5 hook candidates (mix of positive and negative). Positive hooks create curiosity, empowerment, or surprise. Negative hooks use fear, guilt, or shame — label these as negative so we know to avoid them. The conversation_flow should have 4-5 phases that guide the full call, not just the opening.`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Agent 2: Claude — Independent Script Judge
//
// KEY DESIGN: The judge is deliberately INDEPENDENT from the generator.
// - It does NOT see the generator's prompt or instructions
// - It uses the original rubric from the skill document (0-5 per dimension)
// - It is explicitly told to be strict, find faults, and not rubber-stamp
// - It runs the Quality Checks and Failure Modes from the skill doc
// - Its thinking budget is large so its reasoning is thorough and visible
// ---------------------------------------------------------------------------

async function judgeScript(claude, prep, patientContext, logEvent, userId) {
  const judgePrompt = `You are an independent quality assurance judge for health coaching call scripts. You have deep expertise in patient engagement, motivational interviewing, behavioral psychology, and the Hook Model.

Your job is to rigorously evaluate a script and FIND ITS WEAKNESSES. You are NOT trying to help it pass. You are trying to ensure only genuinely excellent scripts get through. Be skeptical. Be thorough. Think like a discerning patient who has heard too many generic health pitches.

## Hook Opener Rubric (Score 0-5 each dimension; total /40)

### 1. Personal Relevance (0-5)
- 5: Cites ONE specific detail from the patient's actual health history AND ties it to their day-to-day impact. The patient would think "they actually read my chart."
- 3: Vaguely personalized — uses their name and a general condition but nothing specific or surprising.
- 0: Generic. Could be sent to any patient.

### 2. Curiosity / Tension (0-5)
- 5: Creates a genuine "wait — what?" moment through contrast, surprise, or reframe. The patient WANTS to hear more. Does NOT cause alarm or anxiety.
- 3: Mildly interesting but predictable. No real surprise.
- 0: Flat recap of known information. No curiosity generated.

### 3. Emotional Safety + Trust (0-5)
- 5: Fully collaborative, zero judgment, zero scolding. Uses "we" language. Warm and human. The patient feels safe and respected.
- 3: Neutral — not harmful but not particularly warm either.
- 0: Shaming, alarmist, preachy, or condescending. Patient would feel lectured.

### 4. Speed to Client Talking (0-5)
- 5: Patient is invited to speak within 10-15 seconds of the opener (1-2 sentences before the question). The script gets out of the way fast.
- 3: Patient invited within 30 seconds.
- 0: Monologue. Patient sits and listens. No question or invitation to speak.

### 5. Clarity of Today's Win (0-5)
- 5: One crisp, concrete goal with a tangible payoff. "4-week experiment," "one lever," "frictionless change." Patient knows exactly what they're signing up for.
- 3: General direction provided but fuzzy. "Let's work on your health."
- 0: No destination. No win framed. Patient wonders "what's the point of this call?"

### 6. Agency + Choice (0-5)
- 5: Clear options presented (A/B/C, "pick one lever," two doors). Patient genuinely CHOOSES their path. Multiple valid options.
- 3: Broad open-ended question with implied choices.
- 0: Directive. Tells patient what to do. No choice offered.

### 7. Energy + Voice (0-5)
- 5: Human, confident, lightly playful. Sounds like a real person who genuinely cares — not a chatbot, not a doctor reading notes. Has personality.
- 3: Fine but forgettable. Polite but could be any automated message.
- 0: Robotic, clinical, reads like a medical pamphlet or insurance letter.

### 8. Brevity / Cognitive Load (0-5)
- 5: One idea, one hook, one question. Under 30 seconds read aloud. Brain can process it in one pass.
- 3: Slightly dense. Two competing ideas or takes 40+ seconds.
- 0: Information overload. Multiple facts, stats, or conditions dumped at once.

---

## Quality Checks (from the skill doc — each must PASS)

Run these independently and report pass/fail for each:
1. ONE anchor detail only (not multiple labs/conditions)
2. Question appears within first 2-3 sentences
3. No long lab lists
4. No alarm language ("risk of fracture soon!", "dangerous", "worrying")
5. Clear agency — patient has a genuine choice
6. Small win is named — a concrete framing ("4-week experiment", "one lever", etc.)

## Failure Modes (check for each — report any detected)

- Too clinical: jargon, medical terminology patients wouldn't use
- Too many facts: multiple anchors competing for attention
- User doesn't talk: question is too vague or missing
- Feels judgey: "you should", "you need to", unsolicited advice tone
- Not sticky: no contrast, no game, no surprise — just information delivery

---

## The Script to Evaluate

**Opening Script:**
"${prep.opening_script}"

**Hook Anchor Used:** ${prep.hook_anchor}
**Follow-up Question:** ${prep.follow_up_question}
**Talking Points:** ${prep.talking_points?.join("; ") || "none provided"}

## Patient Context (for verifying personal relevance — does the script actually use real data?)
${patientContext}

---

## Your Task

Think step by step. For each rubric dimension:
1. Quote the specific part of the script relevant to that dimension
2. Explain what works and what doesn't
3. Assign a score 0-5 with justification

Then run all 6 Quality Checks. Then check for all 5 Failure Modes.

Finally, compute the total score honestly. Do NOT round up. Do NOT give benefit of the doubt. A score of 5 means genuinely excellent — most scripts should score 3-4 on most dimensions.

IMPORTANT: You are an independent judge. Your job is to maintain quality standards, not to help the generator pass. If the script is mediocre, score it as mediocre. If it's excellent, say so. Never inflate scores.

Return JSON:
{
  "dimensions": [
    { "name": "Personal Relevance", "score": 0-5, "feedback": "2-3 sentences: what the script does well/poorly, with specific quotes" },
    { "name": "Curiosity / Tension", "score": 0-5, "feedback": "2-3 sentences" },
    { "name": "Emotional Safety + Trust", "score": 0-5, "feedback": "2-3 sentences" },
    { "name": "Speed to Client Talking", "score": 0-5, "feedback": "2-3 sentences" },
    { "name": "Clarity of Today's Win", "score": 0-5, "feedback": "2-3 sentences" },
    { "name": "Agency + Choice", "score": 0-5, "feedback": "2-3 sentences" },
    { "name": "Energy + Voice", "score": 0-5, "feedback": "2-3 sentences" },
    { "name": "Brevity / Cognitive Load", "score": 0-5, "feedback": "2-3 sentences" }
  ],
  "quality_checks": [
    { "check": "One anchor detail only", "passed": true/false, "detail": "explanation" },
    { "check": "Question within first 2-3 sentences", "passed": true/false, "detail": "explanation" },
    { "check": "No long lab lists", "passed": true/false, "detail": "explanation" },
    { "check": "No alarm language", "passed": true/false, "detail": "explanation" },
    { "check": "Clear agency / patient choice", "passed": true/false, "detail": "explanation" },
    { "check": "Small win named", "passed": true/false, "detail": "explanation" }
  ],
  "failure_modes_detected": ["list any failure modes found, or empty array if none"],
  "total_score": <sum of 8 dimension scores, 0-40>,
  "reasoning_summary": "3-5 sentences: your overall reasoning process and what drove your scores. Be specific.",
  "overall_feedback": "2-3 sentences: the biggest strengths and weaknesses",
  "specific_improvements": "Exactly what to change to push above 32/40. Be concrete and actionable — don't just say 'be more specific', say exactly what to do differently."
}`;

  // Use streaming — required for large thinking budgets (>10 min timeout)
  // Also lets us emit progress events so the console UI shows real-time status
  const stream = claude.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 128000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    messages: [{ role: "user", content: judgePrompt }],
  });

  let thinkingTokens = 0;
  let lastProgressLog = 0;
  let claudeThinking = "";
  let isThinking = true;

  const judgeTextChunks = [];

  stream.on("contentBlockStart", () => {});
  stream.on("contentBlockDelta", (event) => {
    if (event.delta?.type === "thinking_delta") {
      claudeThinking += event.delta.thinking || "";
      thinkingTokens += (event.delta.thinking || "").length;
      // Emit thinking progress every ~1.5s — fire-and-forget (non-blocking)
      const now = Date.now();
      if (now - lastProgressLog > 1500 && thinkingTokens > 200) {
        lastProgressLog = now;
        const recentThinking = claudeThinking.slice(-300).trim();
        const preview = recentThinking.length > 200
          ? "..." + recentThinking.slice(-200)
          : recentThinking;
        if (logEvent) {
          logEvent("judge_thinking", "running", {
            detail: `Judge is analyzing the script (${Math.round(thinkingTokens / 100)}k chars of reasoning so far)`,
            thinkingPreview: preview,
          }).catch(() => {});
        }
      }
    } else if (event.delta?.type === "text_delta") {
      judgeTextChunks.push(event.delta.text || "");
      // Emit text deltas non-blocking via setImmediate
      const accumulated = judgeTextChunks.join("");
      setImmediate(() => {
        emitPipelineEvent(userId, {
          step: "judge_evaluation",
          status: "streaming",
          timestamp: new Date().toISOString(),
          partial_text: accumulated,
          type: "token_delta",
        });
      });
      if (isThinking) {
        isThinking = false;
        if (logEvent) {
          logEvent("judge_thinking", "completed", {
            detail: `Judge finished reasoning (${Math.round(thinkingTokens / 100)}k chars), now writing evaluation`,
            totalThinkingChars: thinkingTokens,
          }).catch(() => {});
        }
      }
    }
  });

  // Timeout the Claude call — if it takes >5 minutes, abort and use best score so far
  const JUDGE_TIMEOUT_MS = 300_000;
  const response = await Promise.race([
    stream.finalMessage(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude judge timed out after 5 minutes")), JUDGE_TIMEOUT_MS)
    ),
  ]);

  // Capture Claude's extended thinking from final message if stream capture missed it
  try {
    const thinkingBlocks = response.content.filter(b => b.type === "thinking");
    if (thinkingBlocks.length > 0) {
      claudeThinking = thinkingBlocks.map(b => b.thinking).join("\n");
    }
  } catch { /* no thinking available */ }

  try {
    const textBlock = response.content.find(b => b.type === "text");
    const text = textBlock?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let result;
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(text);
    }
    result.claudeThinking = claudeThinking;
    return result;
  } catch (e) {
    console.error("[FIRST_CALL_PREP] Judge parse failed:", e.message);
    return {
      dimensions: [],
      quality_checks: [],
      failure_modes_detected: [],
      total_score: 30,
      reasoning_summary: "Judge response could not be parsed — using default score",
      overall_feedback: "Judge parse error — using generator's output",
      specific_improvements: "N/A",
      claudeThinking,
    };
  }
}

module.exports = { prepareFirstCall };
