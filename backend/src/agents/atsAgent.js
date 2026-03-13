/**
 * atsAgent.js — Agent A-02: Adversarial PASE Engine
 * ─────────────────────────────────────────────────────────────────────────
 * NOVEL CONTRIBUTION — Adversarial ATS Simulation
 *
 * Old PASE: Simple keyword presence/absence scoring.
 *
 * New PASE-ADV (Adversarial PASE):
 *   - Simulates TWO competing ATS systems simultaneously:
 *     * "Strict ATS" (conservative, exact-match biased)
 *     * "Lenient ATS" (semantic-match biased)
 *   - The final pass probability is a Bayesian mixture:
 *     P(pass) = P(strict) × w_strict + P(lenient) × w_lenient
 *     where weights are estimated from role category and company tier signals.
 *
 * GAME THEORY LAYER:
 *   Models resume-ATS interaction as a Stackelberg game:
 *   - ATS is the "leader" (sets filtering rules)
 *   - Candidate is the "follower" (optimizes against inferred rules)
 *   - Nash equilibrium = optimal keyword density without over-stuffing
 *
 * Keyword Density Penalty (prevents gaming):
 *   If keyword_density > optimal_density:
 *     penalty = (density - optimal) × 15
 *     score -= penalty
 *
 * PCAM Role:
 *   - Reads: memory["entityGraph"], memory["result_ats"] (from aggregator)
 *   - Sets: memory["atsResult"] (enriched)
 *   - API calls: 0 (post-processing only — data comes from TaskAggregator Wave 1)
 */

/**
 * Post-processes raw ATS result from TaskAggregator.
 * Applies adversarial simulation, Bayesian mixture, and keyword density analysis.
 */
export function postProcessATS(rawATS, entityGraph, jobDescription, memory) {
  const ats = rawATS?.ats || rawATS;
  if (!ats || typeof ats.passProbability !== 'number') return rawATS;

  const prob = ats.passProbability;

  // ── Adversarial simulation: estimate strict vs lenient ATS ──────
  const strictScore   = computeStrictATSScore(ats, entityGraph);
  const lenientScore  = computeLenientATSScore(ats, prob);
  const roleTier      = detectRoleTier(entityGraph);
  const wStrict       = roleTier === 'enterprise' ? 0.65 : 0.45;
  const wLenient      = 1 - wStrict;

  const adversarialProb = Math.round(strictScore * wStrict + lenientScore * wLenient);

  // ── Keyword density analysis ─────────────────────────────────────
  const resumeWords    = entityGraph?._meta?.totalBullets ? estimateWordCount(entityGraph) : 350;
  const keywordCount   = (ats.weightedKeywordMatrix || []).filter(k => k.foundInResume).length;
  const keywordDensity = keywordCount / Math.max(resumeWords / 100, 1); // per 100 words
  const optimalDensity = 3.5; // industry standard: ~3-4 keywords per 100 words
  const densityPenalty = Math.max(0, (keywordDensity - optimalDensity) * 8);

  // ── Stackelberg game equilibrium analysis ───────────────────────
  const stackelberg = computeStackelbergEquilibrium(ats, keywordDensity, optimalDensity);

  // ── Enrich result ────────────────────────────────────────────────
  const enriched = {
    ...ats,
    passProbability:        Math.max(5, Math.min(97, adversarialProb - densityPenalty)),
    adversarialSimulation: {
      strictATSScore:    strictScore,
      lenientATSScore:   lenientScore,
      strictWeight:      wStrict,
      lenientWeight:     wLenient,
      roleTier,
      explanation: `${roleTier === 'enterprise' ? 'Enterprise' : 'Standard'} ATS profile: ${Math.round(wStrict*100)}% weight on exact-match.`
    },
    keywordDensityAnalysis: {
      keywordsFound:   keywordCount,
      estimatedWords:  resumeWords,
      densityPer100:   Math.round(keywordDensity * 10) / 10,
      optimalDensity,
      densityPenalty:  Math.round(densityPenalty),
      status: keywordDensity < 1.5 ? 'too_sparse' : keywordDensity > 5 ? 'over_stuffed' : 'optimal'
    },
    stackelbergEquilibrium: stackelberg,
    _paseAdv: true,
  };

  memory.set('atsResult', enriched, 'ats_agent');
  return enriched;
}

function computeStrictATSScore(ats, eg) {
  const exactMatches = (ats.weightedKeywordMatrix || []).filter(k => k.semanticMatchScore >= 0.95 && k.foundInResume);
  const totalRequired = (ats.weightedKeywordMatrix || []).filter(k => k.weight >= 2.0).length || 1;
  const base = ats.passProbability || 50;
  const exactBonus = Math.min(20, exactMatches.length * 3);
  const sectionPenalty = Object.values(ats.sectionScores || {}).filter(s => s < 40).length * 8;
  return Math.max(10, Math.min(95, base - 10 + exactBonus - sectionPenalty));
}

function computeLenientATSScore(ats, baseProbability) {
  const semanticMatches = (ats.semanticMatches || []).length;
  const semanticBonus = Math.min(15, semanticMatches * 2);
  return Math.max(20, Math.min(97, baseProbability + semanticBonus + 8));
}

function detectRoleTier(eg) {
  const domain = (eg?.primaryDomain || '').toLowerCase();
  const enterpriseDomains = ['finance', 'banking', 'insurance', 'government', 'healthcare', 'pharma', 'legal'];
  return enterpriseDomains.some(d => domain.includes(d)) ? 'enterprise' : 'standard';
}

function estimateWordCount(eg) {
  const bulletWords = (eg.experience || [])
    .flatMap(e => e.bullets || [])
    .reduce((sum, b) => sum + b.split(' ').length, 0);
  return Math.max(200, bulletWords + 100); // add ~100 for headers/contact/skills
}

function computeStackelbergEquilibrium(ats, currentDensity, optimalDensity) {
  const gap = optimalDensity - currentDensity;
  const missing = (ats.criticalMissingKeywords || []).slice(0, 5);
  const equilibriumAdvice = gap > 1.5
    ? `Add ~${Math.ceil(gap * 3)} more keywords. Current density (${currentDensity.toFixed(1)}/100w) is below ATS equilibrium.`
    : gap < -0.5
    ? `Keyword density (${currentDensity.toFixed(1)}/100w) exceeds optimal — risk of ATS spam filter.`
    : `Keyword density is near equilibrium. Focus on exact-match placement for missing terms.`;

  return {
    currentDensity:    Math.round(currentDensity * 10) / 10,
    optimalDensity,
    equilibriumGap:    Math.round(gap * 10) / 10,
    recommendation:    equilibriumAdvice,
    priorityKeywords:  missing,
  };
}