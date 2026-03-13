/**
 * feedbackAgent.js — Agent A-04: SCIS-CL (Cognitive Load Enhanced)
 * ─────────────────────────────────────────────────────────────────────────
 * NOVEL CONTRIBUTION — Recruiter Cognitive Load Model
 *
 * Inspired by: Cognitive Load Theory (Sweller 1988), eye-tracking research,
 *              information foraging theory, F-pattern reading studies.
 *
 * Key insight: Recruiters spend ~7 seconds on initial resume scan.
 * The first 3 bullets per role, and the first role in the list,
 * receive disproportionate attention. SCIS-CL models this attention decay.
 *
 * Attention Weight Model:
 *   attention(i, j) = base_attention × position_decay_factor(i) × role_prominence(j)
 *
 *   where:
 *     i = bullet index within role (0-based)
 *     j = role index (0 = most recent)
 *     position_decay_factor(i) = e^(-0.3 × i)   (first bullet gets full attention)
 *     role_prominence(j)       = e^(-0.15 × j)  (most recent role gets full attention)
 *
 * Cognitive Load Score:
 *   CL(sentence) = sentence_length / 15 + nested_clause_count × 0.4 + jargon_density × 0.3
 *   High CL → recruiter skips or misreads → effective_score = scisScore × (1 - CL_penalty)
 *
 * Effective Impact Score (combines SCIS + attention + cognitive load):
 *   effectiveScore(i, j) = scisScore × attention(i, j) × (1 - cognitiveLoadPenalty)
 *
 * PCAM Role:
 *   - Reads: memory["result_feedback"] (from aggregator), memory["entityGraph"]
 *   - Sets: memory["feedbackAnalysis"] (enriched)
 *   - API calls: 0 (post-processing only)
 */

/**
 * Post-processes SCIS feedback from TaskAggregator.
 * Applies attention modeling and cognitive load analysis.
 */
export function postProcessFeedback(rawFeedback, entityGraph, memory) {
  const fb = rawFeedback?.feedback || rawFeedback;
  if (!fb || !fb.sentences) return rawFeedback;

  const eg = entityGraph || {};

  // ── Map bullets to their role position ──────────────────────────
  const bulletPositionMap = buildBulletPositionMap(eg);

  // ── Apply attention + cognitive load to each sentence ───────────
  const enrichedSentences = fb.sentences.map((s, globalIdx) => {
    const pos = bulletPositionMap[s.text?.substring(0, 50)] || { bulletIdx: globalIdx % 5, roleIdx: Math.floor(globalIdx / 5) };

    const attentionWeight    = computeAttentionWeight(pos.bulletIdx, pos.roleIdx);
    const cognitiveLoad      = computeCognitiveLoad(s.text || '');
    const effectiveScore     = Math.round(
      (s.scisScore || 0) * attentionWeight * (1 - cognitiveLoad.penalty)
    );

    // Recruiter readability tier
    const readabilityTier = cognitiveLoad.clScore < 0.3 ? 'easy'
                          : cognitiveLoad.clScore < 0.6 ? 'moderate'
                          : 'heavy';

    return {
      ...s,
      attentionWeight:   Math.round(attentionWeight * 100) / 100,
      effectiveScore,
      cognitiveLoad: {
        score:         Math.round(cognitiveLoad.clScore * 100) / 100,
        penalty:       Math.round(cognitiveLoad.penalty * 100) / 100,
        wordCount:     cognitiveLoad.wordCount,
        readabilityTier,
        issues:        cognitiveLoad.issues,
      },
      positionContext: {
        bulletIndex: pos.bulletIdx,
        roleIndex:   pos.roleIdx,
        prominenceNote: pos.roleIdx === 0 ? 'Most recent role — highest visibility'
                      : pos.roleIdx === 1 ? 'Second role — good visibility'
                      : 'Lower visibility — optimize other bullets first'
      }
    };
  });

  // ── Compute section-level attention scores ───────────────────────
  const sectionAttention = computeSectionAttention(enrichedSentences, eg);

  // ── Overall recruiter experience score ───────────────────────────
  const recruiterExperienceScore = computeRecruiterExperienceScore(enrichedSentences);

  // ── Compute heatmap intensity for full-page visualization ────────
  const heatmapData = buildHeatmapData(enrichedSentences);

  const enriched = {
    ...fb,
    sentences:              enrichedSentences,
    overallImpactScore:     fb.overallImpactScore || Math.round(enrichedSentences.reduce((s, x) => s + (x.scisScore || 0), 0) / Math.max(enrichedSentences.length, 1)),
    recruiterExperienceScore,
    sectionAttention,
    heatmapData,
    attentionModel: {
      description:    'Recruiter attention modeled as dual exponential decay by bullet position and role recency.',
      bulletDecay:    0.3,
      roleDecay:      0.15,
      optimalLength:  '12–18 words per bullet',
      avgAttention:   Math.round(enrichedSentences.reduce((s, x) => s + x.attentionWeight, 0) / Math.max(enrichedSentences.length, 1) * 100) / 100,
    },
    _scisVersion: 'CL-2.0',
  };

  memory.set('feedbackAnalysis', enriched, 'feedback_agent');
  return enriched;
}

/**
 * Build map of bullet_text_prefix → { bulletIdx, roleIdx }
 * Used to assign position-based attention weights to SCIS sentences.
 */
function buildBulletPositionMap(eg) {
  const map = {};
  (eg.experience || []).forEach((exp, roleIdx) => {
    (exp.bullets || []).forEach((bullet, bulletIdx) => {
      map[bullet.substring(0, 50)] = { bulletIdx, roleIdx };
    });
  });
  return map;
}

/**
 * Compute attention weight based on position.
 * attention(i, j) = e^(-0.3 × i) × e^(-0.15 × j)
 * Capped at 1.0, minimum 0.2.
 */
function computeAttentionWeight(bulletIdx, roleIdx) {
  const w = Math.exp(-0.3 * bulletIdx) * Math.exp(-0.15 * roleIdx);
  return Math.max(0.20, Math.min(1.0, Math.round(w * 100) / 100));
}

/**
 * Compute cognitive load score for a sentence.
 * Higher score = harder for recruiter to quickly parse.
 */
function computeCognitiveLoad(text) {
  const words       = text.trim().split(/\s+/);
  const wordCount   = words.length;
  const commas      = (text.match(/,/g) || []).length;
  const semicolons  = (text.match(/;/g) || []).length;
  const parens      = (text.match(/\(/g) || []).length;
  const jargonWords = words.filter(w => w.length > 12).length; // long words = jargon proxy

  // CL = length_factor + clause_factor + jargon_factor
  const lengthFactor = Math.max(0, (wordCount - 15) / 30);  // ideal is 12–18 words
  const clauseFactor = (commas + semicolons + parens) * 0.08;
  const jargonFactor = (jargonWords / Math.max(wordCount, 1)) * 0.4;
  const clScore      = Math.min(1.0, lengthFactor + clauseFactor + jargonFactor);

  const issues = [];
  if (wordCount > 25) issues.push(`Too long (${wordCount} words — aim for 12–18)`);
  if (commas > 3)     issues.push(`Too many clauses (${commas} commas)`);
  if (jargonWords > 3) issues.push('Dense technical jargon — consider simplifying');

  return { clScore, penalty: clScore * 0.3, wordCount, issues };
}

function computeSectionAttention(sentences, eg) {
  const byRole = {};
  sentences.forEach(s => {
    const roleIdx = s.positionContext?.roleIndex ?? 0;
    const key = eg.experience?.[roleIdx]
      ? `${eg.experience[roleIdx].role} @ ${eg.experience[roleIdx].company}`
      : `Role ${roleIdx + 1}`;
    if (!byRole[key]) byRole[key] = { sentences: [], totalAttention: 0 };
    byRole[key].sentences.push(s);
    byRole[key].totalAttention += s.attentionWeight;
  });

  return Object.entries(byRole).map(([role, data]) => ({
    role,
    bulletCount:    data.sentences.length,
    avgSCIS:        Math.round(data.sentences.reduce((s, x) => s + (x.scisScore || 0), 0) / data.sentences.length),
    avgAttention:   Math.round(data.totalAttention / data.sentences.length * 100) / 100,
    effectiveScore: Math.round(data.sentences.reduce((s, x) => s + (x.effectiveScore || 0), 0) / data.sentences.length),
  }));
}

function computeRecruiterExperienceScore(sentences) {
  // Weighted average: effective score × attention
  const totalWeight = sentences.reduce((s, x) => s + x.attentionWeight, 0);
  const weightedScore = sentences.reduce((s, x) => s + ((x.effectiveScore || 0) * x.attentionWeight), 0);
  return Math.round(weightedScore / Math.max(totalWeight, 1));
}

function buildHeatmapData(sentences) {
  return sentences.map(s => ({
    text:           s.text,
    scisScore:      s.scisScore,
    effectiveScore: s.effectiveScore,
    attentionWeight:s.attentionWeight,
    tier:           s.tier,
    source:         s.source,
    // HSL-ready intensity value for frontend visualization
    heatIntensity:  Math.round(s.effectiveScore * s.attentionWeight) / 100,
  }));
}