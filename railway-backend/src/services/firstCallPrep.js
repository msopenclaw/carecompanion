const { eq } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk");
const { db } = require("../db");
const { patientMemory, userProfiles } = require("../db/schema");
const { getCompactedContext } = require("./ehrCompaction");
const { decrypt } = require("./encryption");

const MAX_ITERATIONS = 5;
const MIN_SCORE = 36; // out of 40 (90% bar)

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
 * The two agents negotiate: if the judge scores below 36/40 (90%), the generator
 * gets the judge's full critique and must rework. This continues up to 5 iterations
 * until the judge is satisfied.
 *
 * All steps are logged with full verbosity to pipeline_log for console display.
 */
async function prepareFirstCall(userId) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("No GEMINI_API_KEY");

  const pipelineLog = [];
  const logEvent = (step, status, detail) => {
    const event = { step, status, timestamp: new Date().toISOString(), ...detail };
    pipelineLog.push(event);
    console.log(`[FIRST_CALL_PREP] [${step}] ${status}: ${JSON.stringify(detail)}`);
  };

  // ── Load patient context ──
  logEvent("load_context", "running", {
    detail: "Loading patient data and compacted memory",
    maxIterations: MAX_ITERATIONS,
    minScore: `${MIN_SCORE}/40 (90%)`,
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
    currentFocus = `${profile.glp1Medication} therapy management`;
  }

  logEvent("load_context", "completed", {
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
  const gemini = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

  // ── Agent 2: Claude — Script Judge ──
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const hasJudge = !!ANTHROPIC_API_KEY;
  let claude = null;
  if (hasJudge) {
    claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    logEvent("agents_init", "completed", {
      generator: "gemini-3.1-pro-preview",
      judge: "claude-sonnet-4-6",
      mode: "dual-agent adversarial",
      detail: "Judge is fully independent — uses the Hook Opener Rubric (8 dimensions, 0-5 each, /40). Generator never sees rubric scoring logic. Judge is instructed to be strict and find faults.",
    });
  } else {
    logEvent("agents_init", "completed", {
      generator: "gemini-3.1-pro-preview",
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

    // ── Step 1: Gemini generates the script ──
    logEvent("script_generation", "running", {
      iteration: iterations,
      isRevision: i > 0,
      previousScore: judgeFeedback ? `${judgeFeedback.total_score}/40` : null,
      detail: i === 0
        ? "Generating opening script from patient context using Health Coach Hook skill"
        : `Revision #${i} — reworking based on judge critique (previous: ${judgeFeedback?.total_score}/40, need ${MIN_SCORE}/40)`,
    });

    const generatorPrompt = buildGeneratorPrompt(patientContext, judgeFeedback, i);
    const genStart = Date.now();
    const genResult = await gemini.generateContent({
      contents: [{ role: "user", parts: [{ text: generatorPrompt }] }],
      generationConfig: { maxOutputTokens: 65536, responseMimeType: "application/json" },
    });
    const genDuration = Date.now() - genStart;

    // Capture Gemini thinking if available
    let geminiThinking = null;
    try {
      const parts = genResult.response.candidates?.[0]?.content?.parts || [];
      const thoughtParts = parts.filter(p => p.thought);
      if (thoughtParts.length > 0) {
        geminiThinking = thoughtParts.map(p => p.text).join("\n");
      }
    } catch { /* no thinking available */ }

    let prep;
    try {
      prep = JSON.parse(genResult.response.text());
    } catch {
      logEvent("script_generation", "error", {
        iteration: iterations,
        error: "Gemini JSON parse failed",
        geminiThinking,
        durationMs: genDuration,
      });
      continue;
    }

    logEvent("script_generation", "completed", {
      iteration: iterations,
      hookAnchor: prep.hook_anchor,
      openingScript: prep.opening_script,
      scriptPreview: prep.opening_script?.substring(0, 120) + "...",
      talkingPoints: prep.talking_points,
      followUpQuestion: prep.follow_up_question,
      geminiThinking,
      durationMs: genDuration,
    });

    // If no judge, accept first generation
    if (!hasJudge) {
      bestPrep = prep;
      bestScore = prep.rubric_score?.total || 30;
      logEvent("script_accepted", "completed", {
        iteration: iterations,
        score: bestScore,
        maxScore: 40,
        reason: "single-pass mode (no judge available)",
      });
      break;
    }

    // ── Step 2: Claude judges the script ──
    logEvent("judge_evaluation", "running", {
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
    const judgeResult = await judgeScript(claude, prep, patientContext);
    const judgeDuration = Date.now() - judgeStart;

    const scorePercentage = Math.round((judgeResult.total_score / 40) * 100);

    logEvent("judge_evaluation", "completed", {
      iteration: iterations,
      totalScore: judgeResult.total_score,
      maxScore: 40,
      percentage: `${scorePercentage}%`,
      threshold: `${MIN_SCORE}/40 (90%)`,
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
      logEvent("script_accepted", "completed", {
        iteration: iterations,
        score: judgeResult.total_score,
        maxScore: 40,
        percentage: `${scorePercentage}%`,
        reason: `Score ${judgeResult.total_score}/40 (${scorePercentage}%) >= threshold ${MIN_SCORE}/40 (90%)`,
        finalScript: bestPrep.opening_script,
        finalHookAnchor: bestPrep.hook_anchor,
        finalTalkingPoints: bestPrep.talking_points,
        finalFollowUp: bestPrep.follow_up_question,
      });
      break;
    }

    // Below threshold — feed Claude's critique back to Gemini for rework
    judgeFeedback = judgeResult;
    const weakDims = judgeResult.dimensions
      ?.filter(d => d.score < 4)
      ?.map(d => `${d.name}: ${d.score}/5 — ${d.feedback}`) || [];

    logEvent("revision_requested", "completed", {
      iteration: iterations,
      score: judgeResult.total_score,
      maxScore: 40,
      percentage: `${scorePercentage}%`,
      reason: `Score ${judgeResult.total_score}/40 (${scorePercentage}%) < threshold ${MIN_SCORE}/40 (90%) — judge rejected, sending critique back to generator`,
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
  }

  // Fallback if nothing worked
  if (!bestPrep) {
    bestPrep = {
      opening_script: `Hey ${firstName} — thanks for signing up. I've been looking at your profile, and I'd love to chat about how things are going. What's been the biggest challenge so far?`,
      hook_anchor: "medication adherence",
      talking_points: ["Current medication regimen", "Side effects management", "Daily routine integration"],
      follow_up_question: "What's been the biggest challenge — remembering to take it, dealing with side effects, or fitting it into your routine?",
    };
    logEvent("fallback_used", "completed", {
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

  // Save to patient_memory — MERGE pipeline logs, don't overwrite
  const [currentMem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  if (currentMem) {
    const tier2 = currentMem.tier2 || {};
    tier2.first_call_prep = bestPrep;
    const existingLog = tier2.pipeline_log || [];
    tier2.pipeline_log = [...existingLog, ...pipelineLog];

    // Also append to the latest pipeline_runs entry if it exists
    const runs = tier2.pipeline_runs || [];
    if (runs.length > 0) {
      const latestRun = runs[runs.length - 1];
      latestRun.events = [...(latestRun.events || []), ...pipelineLog];
      tier2.pipeline_runs = runs;
    }

    await db.update(patientMemory).set({
      tier2,
      updatedAt: new Date(),
    }).where(eq(patientMemory.userId, userId));
  } else {
    const run = { startedAt: new Date().toISOString(), events: pipelineLog };
    await db.insert(patientMemory).values({
      userId,
      tier2: { first_call_prep: bestPrep, pipeline_log: pipelineLog, pipeline_runs: [run] },
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

Generate an engaging 30-second opening script for a health coaching call that:
- Feels personalized to the patient's health history
- Quickly invites the patient to talk
- Creates curiosity without fear
- Sets up a small, winnable focus for the call

## Patient Context
${patientContext}

## Core Principles (from the Hook skill doc)

### Use ONE "anchor detail"
Pick one highly relevant, non-scary detail from the record. Examples:
- a specific imaging result, a recurring symptom pattern, a lifestyle constraint, a prior clinician recommendation.
Avoid dumping multiple labs/conditions upfront.

### Convert the anchor into a story-worthy contrast
Examples: "Your spine is fine, your hips are the laggard." / "It's not a crisis—it's a 'respond now and win' signal."

### Ask an easy question fast
Prefer multiple-choice, A/B/C, "pick one lever."

### Provide a small win frame
"4-week experiment," "one lever," "frictionless change."

### Avoid fear and medical lecturing
No catastrophizing. No shaming. Use "we" language.

## Templates (pick the best fit or blend)

Template A (Contrast + Game + Choice):
"I re-opened your [test/record]. [One contrast]. Let's do a quick game: [3 options]. If you had to bet on one lever for the next month, which one — and why?"

Template B (Win Frame + Two Doors):
"For the next 4 weeks, we can aim for either [Door 1] or [Door 2]. Based on [anchor detail], which door feels most valuable right now?"

Template C (Surprise Reframe + Single Question):
"Most people think [common belief]. Your record suggests [reframe]. What would make this feel easy to start this week?"

## Quality Checks (your output must pass all of these)
- ONE anchor detail only
- Question appears within first 2-3 sentences
- No long lab lists
- No alarm language ("risk of fracture soon!")
- Clear agency and a small win
- Under 40 seconds when read aloud`;

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

Return JSON:
{
  "opening_script": "The exact script to read (address patient by first name)",
  "hook_anchor": "The one detail you anchored on",
  "talking_points": ["3 follow-up insights to weave into the call"],
  "follow_up_question": "The easy question at the end (preferably multiple choice A/B/C)"
}`;

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

async function judgeScript(claude, prep, patientContext) {
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
  "specific_improvements": "Exactly what to change to push above 36/40. Be concrete and actionable — don't just say 'be more specific', say exactly what to do differently."
}`;

  const response = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128000,
    thinking: { type: "enabled", budget_tokens: 100000 },
    messages: [{ role: "user", content: judgePrompt }],
  });

  // Capture Claude's extended thinking
  let claudeThinking = null;
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
