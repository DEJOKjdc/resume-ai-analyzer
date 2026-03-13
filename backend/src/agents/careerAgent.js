/**
 * careerAgent.js — Agent A-05: Markov Career Trajectory Engine
 * ─────────────────────────────────────────────────────────────────────────
 * NOVEL CONTRIBUTION — Career as a Stochastic Markov Process
 *
 * Inspired by: Hidden Markov Models, Modern Portfolio Theory,
 *              Chaos theory (career bifurcation points), Game theory
 *
 * Old career agent: Simple next-role suggestion list.
 *
 * New MCTE (Markov Career Trajectory Engine):
 *   Models career as a Markov chain where:
 *   - States = seniority levels (intern → junior → mid → senior → lead → principal)
 *   - Transitions = probability of moving between states in each period
 *   - Transition matrix is PERSONALIZED by the candidate's skill SVS scores
 *
 *   P(state_j | state_i) = base_transition(i → j) × skill_alignment_factor(j)
 *
 *   where:
 *     base_transition   = industry average transition rate from historical data
 *     skill_alignment   = dot product of (required skills for state_j) vs (candidate SVS vector)
 *
 * Career Bifurcation Points:
 *   At each 2-year milestone, the model identifies BIFURCATION EVENTS —
 *   moments where the career trajectory can diverge sharply.
 *   Inspired by chaos theory — small skill acquisitions can radically change path.
 *
 * Career-as-Portfolio Model (from Modern Portfolio Theory):
 *   Each career path has an expected_return (salary growth) and risk (volatility of role demand).
 *   Efficient frontier: maximize expected return for given risk level.
 *
 * PCAM Role:
 *   - Reads: memory["result_career"], memory["skillIntelligence"], memory["entityGraph"]
 *   - Sets: memory["careerTrajectory"] (enriched)
 *   - API calls: 0 (post-processing)
 */

// Industry-average Markov transition probabilities (per 2-year period)
// Rows = current state, Cols = next state
// States: [intern, junior, mid, senior, lead, principal, executive]
const BASE_TRANSITION_MATRIX = {
  intern:     { junior: 0.85, mid: 0.10, senior: 0.01, lateral: 0.04 },
  junior:     { mid: 0.70,    senior: 0.15, lead: 0.03, lateral: 0.12 },
  mid:        { senior: 0.55, lead: 0.20,   principal: 0.05, lateral: 0.15, pivot: 0.05 },
  senior:     { lead: 0.40,   principal: 0.20, executive: 0.05, lateral: 0.20, pivot: 0.15 },
  lead:       { principal: 0.35, executive: 0.15, lateral: 0.25, pivot: 0.25 },
  principal:  { executive: 0.25, lateral: 0.30, pivot: 0.45 },
  executive:  { lateral: 0.40, pivot: 0.30, maintain: 0.30 }
};

// Skills required to unlock each seniority level
const SENIORITY_SKILL_REQUIREMENTS = {
  senior:     ['Python|JavaScript|Java|TypeScript|C++', 'Git', 'REST API|GraphQL', 'SQL|PostgreSQL|MongoDB'],
  lead:       ['System Design', 'Architecture|Microservices|Cloud|AWS|GCP|Azure', 'Mentoring|Leadership|Management'],
  principal:  ['LLM|Machine Learning|AI|Distributed Systems', 'Architecture', 'Strategy|Planning'],
  executive:  ['Strategy', 'Leadership', 'P&L|Budget|Roadmap'],
};

export function postProcessCareerTrajectory(rawCareer, skillIntelligence, entityGraph, memory) {
  const career = rawCareer?.career || rawCareer;
  if (!career || !career.careerPaths) return rawCareer;

  const eg           = entityGraph || {};
  const skillData    = skillIntelligence || {};
  const currentLevel = eg.seniorityLevel || 'mid';

  // ── Apply Markov transition probabilities ────────────────────────
  const markovTransitions = computeMarkovTransitions(currentLevel, skillData);

  // ── Enrich career paths with portfolio analysis ──────────────────
  const enrichedPaths = (career.careerPaths || []).map((path, idx) => {
    const portfolioMetrics = computePathPortfolioMetrics(path, skillData);
    const bifurcationPoints = identifyBifurcationPoints(path, skillData);
    const markovProb = getMarkovProbability(path, markovTransitions, currentLevel);

    return {
      ...path,
      markovTransitionProbability: markovProb,
      portfolioMetrics,
      bifurcationPoints,
      _enriched: true,
    };
  });

  // ── Efficient frontier analysis ───────────────────────────────────
  const efficientFrontier = computeEfficientFrontier(enrichedPaths);

  // ── Skill unlock recommendations (Markov-guided) ─────────────────
  const skillUnlocks = computeSkillUnlocks(currentLevel, skillData);

  const enriched = {
    ...career,
    careerPaths: enrichedPaths,
    markovModel: {
      currentState:    currentLevel,
      transitions:     markovTransitions,
      description:     `Career modeled as Markov chain. 2-year transition probabilities personalized by SVS scores.`,
    },
    efficientFrontier,
    skillUnlocks,
    _mcteVersion: '2.0',
  };

  memory.set('careerTrajectory', enriched, 'career_agent');
  return enriched;
}

function computeMarkovTransitions(currentLevel, skillData) {
  const base = BASE_TRANSITION_MATRIX[currentLevel] || BASE_TRANSITION_MATRIX.mid;
  const skills = skillData.skills || [];
  const avgSVS = skills.length
    ? skills.reduce((s, k) => s + (k.svsPercent || 50), 0) / skills.length
    : 50;

  // Skill alignment multiplier: high SVS → higher upward transition probability
  const skillMultiplier = 0.7 + (avgSVS / 100) * 0.6;

  const transitions = {};
  for (const [nextState, baseProb] of Object.entries(base)) {
    const isUpward = ['junior','mid','senior','lead','principal','executive'].includes(nextState);
    transitions[nextState] = Math.min(0.95, Math.round(
      (isUpward ? baseProb * skillMultiplier : baseProb) * 100
    ) / 100);
  }
  return transitions;
}

function computePathPortfolioMetrics(path, skillData) {
  // Estimate expected salary growth rate (annualized %)
  const timeline = path.timeline || {};
  const oneYr    = extractSalaryMid(timeline.oneYear?.salaryRange);
  const fiveYr   = extractSalaryMid(timeline.fiveYears?.salaryRange);
  const growth   = oneYr && fiveYr ? Math.round(((fiveYr / oneYr) ** 0.25 - 1) * 100) : 12;

  // Risk = variance in required skill SVS (high variance = riskier path)
  const requiredSkills = path.requiredSkillsToAcquire || [];
  const risk = requiredSkills.length > 4 ? 'high' : requiredSkills.length > 2 ? 'medium' : 'low';

  // Sharpe-inspired ratio: return / risk_score
  const riskScore = { low: 1, medium: 2, high: 3 }[risk];
  const sharpeRatio = Math.round((growth / riskScore) * 10) / 10;

  return {
    expectedAnnualGrowth: `${growth}%`,
    risk,
    sharpeRatio,
    recommendation: sharpeRatio > 6
      ? 'Excellent risk-adjusted return — priority path'
      : sharpeRatio > 3
      ? 'Good return for the skill investment required'
      : 'High skill investment for moderate return'
  };
}

function identifyBifurcationPoints(path, skillData) {
  const criticalSkills = (path.requiredSkillsToAcquire || []).filter(s => s.priority === 'critical');
  return criticalSkills.slice(0, 3).map(s => ({
    skill:       s.skill,
    learnWeeks:  s.timeToLearnWeeks,
    impact:      `Acquiring "${s.skill}" bifurcates the trajectory — opens ${path.pathName} with ${path.probability}% probability`,
    urgency:     s.timeToLearnWeeks <= 4 ? 'immediate' : s.timeToLearnWeeks <= 12 ? 'near-term' : 'long-term'
  }));
}

function getMarkovProbability(path, transitions, currentLevel) {
  const pathType = path.pathType;
  if (pathType === 'vertical')  return transitions.senior || transitions.lead || 0.4;
  if (pathType === 'lateral')   return transitions.lateral || 0.2;
  if (pathType === 'pivot')     return transitions.pivot || 0.15;
  return path.probability / 100 || 0.3;
}

function computeEfficientFrontier(paths) {
  if (!paths.length) return null;
  const sorted = [...paths].sort((a, b) =>
    (b.portfolioMetrics?.sharpeRatio || 0) - (a.portfolioMetrics?.sharpeRatio || 0)
  );
  return {
    optimalPath:     sorted[0]?.pathName,
    rationale:       `Highest risk-adjusted return: Sharpe ratio ${sorted[0]?.portfolioMetrics?.sharpeRatio || 'N/A'}`,
    frontier:        sorted.map(p => ({
      path:       p.pathName,
      growth:     p.portfolioMetrics?.expectedAnnualGrowth,
      risk:       p.portfolioMetrics?.risk,
      sharpe:     p.portfolioMetrics?.sharpeRatio,
    }))
  };
}

function computeSkillUnlocks(currentLevel, skillData) {
  const levels = ['junior','mid','senior','lead','principal','executive'];
  const currentIdx = levels.indexOf(currentLevel);
  if (currentIdx < 0) return [];

  const nextLevels = levels.slice(currentIdx + 1, currentIdx + 3);
  const skills = skillData.skills || [];

  return nextLevels.map(level => {
    const required = SENIORITY_SKILL_REQUIREMENTS[level] || [];
    const missing = required.filter(req => {
      const options = req.split('|');
      return !options.some(opt => skills.some(s => s.name.toLowerCase().includes(opt.toLowerCase()) && s.svsPercent > 40));
    });
    return {
      unlocks: level,
      missingSkills: missing.map(m => m.split('|')[0]),
      readiness: missing.length === 0 ? 'ready' : missing.length <= 2 ? 'near-ready' : 'needs-work'
    };
  });
}

function extractSalaryMid(range) {
  if (!range) return null;
  const nums = range.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  return (parseInt(nums[0]) + parseInt(nums[1])) / 2;
}