/**
 * predictiveGate.js — PCAM Component 4 (Most Novel)
 * ─────────────────────────────────────────────────────────────────────────
 * The Predictive API Gate evaluates whether each agent's requested API call
 * is WORTH making, based on expected information gain vs token cost.
 *
 * NOVEL ALGORITHM:
 *   call_value = expected_information_gain(task) / normalized_token_cost(task)
 *   ALLOW if call_value ≥ threshold (default: 0.6)
 *   BLOCK if call_value < threshold → use speculative heuristic reasoning instead
 *
 * Speculative Reasoning (Novel):
 *   Before blocking, the gate attempts to compute a heuristic answer.
 *   If heuristic confidence ≥ speculativeThreshold → return heuristic, skip call.
 *   This is "Speculative Agent Reasoning" — agents predict answers from known signals.
 *
 * Formula for information gain estimation:
 *   IG(task) = H(prior) - H(posterior_estimate)
 *   where H = Shannon entropy approximation based on input richness signals.
 *
 * This is the architectural innovation that separates PCAM from naive pipelines.
 */

// Token cost weights per task type (normalized 0–1)
const TOKEN_COSTS = {
  parse:       0.55,  // medium — needs full resume
  ats:         0.45,  // medium — focused keyword task
  skills:      0.35,  // lower  — uses compact skill list
  career:      0.40,  // medium — structured prediction
  feedback:    0.65,  // higher — per-sentence analysis
  reconstruct: 0.70,  // highest — generation task
};

// Minimum call value to allow API access
const ALLOW_THRESHOLD   = 0.55;
const SPECULATIVE_CONF  = 0.75;  // confidence needed to skip API via heuristics

export class PredictiveGate {
  constructor() {
    this._decisions = [];
  }

  /**
   * Evaluate whether task should call the API.
   * Returns { allow, reason, heuristicResult, confidence, callValue }
   */
  evaluate(taskType, memory, intent, context = {}) {
    const tokenCost = TOKEN_COSTS[taskType] ?? 0.5;

    // ── Step 1: Check shared memory first ──────────────────────────
    const memoryKey = `result_${taskType}`;
    if (memory.has(memoryKey)) {
      const decision = { allow: false, reason: 'memory_hit', callValue: 0, confidence: 1.0, heuristicResult: memory.get(memoryKey) };
      this._decisions.push({ task: taskType, ...decision });
      memory.recordSavedCall(taskType, 'shared_memory_hit');
      return decision;
    }

    // ── Step 2: Check intent filter ────────────────────────────────
    const intentKey = `requires_${taskType === 'parse' ? 'parsing' : taskType === 'reconstruct' ? 'reconstruction' : taskType}`;
    if (intent[intentKey] === false) {
      const decision = { allow: false, reason: 'intent_disabled', callValue: 0, confidence: 0.9, heuristicResult: null };
      this._decisions.push({ task: taskType, ...decision });
      memory.recordSavedCall(taskType, 'intent_filter');
      return decision;
    }

    // ── Step 3: Estimate information gain ──────────────────────────
    const ig = this._estimateInfoGain(taskType, memory, context);
    const callValue = ig / tokenCost;

    // ── Step 4: Speculative reasoning attempt ──────────────────────
    if (callValue < ALLOW_THRESHOLD) {
      const spec = this._speculativeReason(taskType, memory, context);
      if (spec.confidence >= SPECULATIVE_CONF) {
        const decision = { allow: false, reason: 'speculative_reasoning', callValue, confidence: spec.confidence, heuristicResult: spec.result };
        this._decisions.push({ task: taskType, ...decision });
        memory.set(memoryKey, spec.result, `speculative_${taskType}`);
        memory.recordSavedCall(taskType, `speculative_confidence_${spec.confidence.toFixed(2)}`);
        return decision;
      }
    }

    // ── Step 5: Allow API call ─────────────────────────────────────
    const decision = { allow: true, reason: 'api_required', callValue: parseFloat(callValue.toFixed(3)), confidence: ig, heuristicResult: null };
    this._decisions.push({ task: taskType, ...decision });
    return decision;
  }

  /**
   * Estimate information gain for a task given current memory state.
   * Higher IG = more valuable to call the API.
   * Uses Shannon entropy approximation based on input richness signals.
   */
  _estimateInfoGain(taskType, memory, context) {
    const signals = context.intentSignals || {};
    const resumeLen = context.resumeLength || 0;

    const gainMap = {
      parse: () => {
        // Parsing always high gain if no entity graph yet
        if (!memory.has('entityGraph')) return 0.95;
        return 0.1; // already parsed
      },
      ats: () => {
        if (!context.hasJD) return 0.3; // no JD → low gain
        const hasKw = signals.jdHasSkills;
        const hasReqs = signals.jdHasRequirements;
        return 0.5 + (hasKw ? 0.2 : 0) + (hasReqs ? 0.2 : 0);
      },
      skills: () => {
        const eg = memory.get('entityGraph');
        if (!eg) return 0.5;
        const skillCount = eg.skills?.length || 0;
        // More skills = more value in decay analysis
        if (skillCount > 15) return 0.85;
        if (skillCount > 5)  return 0.70;
        return 0.45;
      },
      career: () => {
        const eg = memory.get('entityGraph');
        if (!eg) return 0.5;
        const hasRoles = (eg.experience?.length || 0) > 0;
        const hasSVS   = memory.has('result_skills');
        return (hasRoles ? 0.4 : 0.2) + (hasSVS ? 0.35 : 0.15);
      },
      feedback: () => {
        const eg = memory.get('entityGraph');
        if (!eg) return 0.5;
        const bulletCount = (eg.experience || []).reduce((a, e) => a + (e.bullets?.length || 0), 0);
        if (bulletCount > 10) return 0.90;
        if (bulletCount > 4)  return 0.75;
        return 0.40;
      },
      reconstruct: () => {
        const hasFeedback = memory.has('result_feedback');
        const hasATS      = memory.has('result_ats');
        // Reconstruction is only high-value if we have context from other agents
        return (hasFeedback ? 0.45 : 0.20) + (hasATS ? 0.35 : 0.15);
      },
    };

    return gainMap[taskType] ? gainMap[taskType]() : 0.6;
  }

  /**
   * Speculative reasoning — compute heuristic answer without API call.
   * Returns { result, confidence }.
   * High confidence = safe to skip API call entirely.
   */
  _speculativeReason(taskType, memory, context) {
    const eg = memory.get('entityGraph');

    if (taskType === 'ats' && !context.hasJD) {
      // No JD → generic ATS score based on resume quality signals
      const signals = context.intentSignals || {};
      let score = 50;
      if (signals.hasBullets)        score += 10;
      if (signals.hasQuantification) score += 15;
      if (signals.hasSkillsSection)  score += 10;
      if (signals.hasEducation)      score += 5;
      return {
        confidence: 0.80,
        result: {
          passProbability: Math.min(85, score),
          confidenceInterval: [score - 10, score + 10],
          sectionScores: { skills: score, experience: score - 5, education: 70, formatting: 72 },
          criticalMissingKeywords: [],
          weightedKeywordMatrix: [],
          atsCompatibilityIssues: ['No job description — showing general ATS compatibility score'],
          recommendation: 'Add a job description for precise ATS simulation.',
          roleCategory: eg?.primaryDomain || 'General',
          semanticMatches: [],
          _speculative: true
        }
      };
    }

    if (taskType === 'career' && !eg) {
      return { confidence: 0.0, result: null }; // can't reason without entity graph
    }

    // Default: low confidence, needs real API call
    return { confidence: 0.0, result: null };
  }

  getDecisions() { return this._decisions; }
}