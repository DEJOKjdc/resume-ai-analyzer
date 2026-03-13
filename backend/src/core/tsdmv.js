/**
 * tsdmv.js — Temporal Skill Decay & Market Vitality Model
 * ─────────────────────────────────────────────────────────────────────────
 * NOVEL CONTRIBUTION #4 (patent spec IPR0002645P) — STRONGEST NOVELTY ANCHOR
 *
 * Formula:
 *   SVS(skill, t) = base_proficiency × e^(−λ × years_since_last_use) × market_demand_index
 *
 * λ (volatility constants) by category:
 *   framework:           0.35  (React, Vue — high churn)
 *   platform:            0.30  (AWS services evolve fast)
 *   tool:                0.25  (Docker, K8s — moderate)
 *   programming_language:0.10  (Python, Java — stable)
 *   database:            0.12  (stable)
 *   methodology:         0.15  (Agile — moderate)
 *   soft_skill:          0.05  (Communication — near-permanent)
 *
 * NOVEL EXTENSION — "Radioactive Half-Life" Model:
 *   Half-life H(λ) = ln(2) / λ
 *   e.g., React half-life = ln(2)/0.35 = ~1.98 years
 *   e.g., Python half-life = ln(2)/0.10 = ~6.93 years
 *
 * This runs LOCALLY with zero API calls. Market demand indices are pre-computed
 * from job board trend data. The PCAM gate never needs to call the API for SVS.
 *
 * The Gemini call in the skills agent enriches this with market intelligence
 * commentary, but the core SVS scores are heuristic-computed here first.
 */

const CURRENT_YEAR = new Date().getFullYear();

export const VOLATILITY = {
  framework:            0.35,
  platform:             0.30,
  tool:                 0.25,
  programming_language: 0.10,
  database:             0.12,
  methodology:          0.15,
  soft_skill:           0.05,
  other:                0.20,
};

// Market Demand Index (0.1–2.0). 1.0 = neutral. Updated 2025/2026.
export const MARKET_DEMAND = {
  // AI/ML — highest demand
  'llm': 2.0, 'generative ai': 2.0, 'langchain': 1.95, 'rag': 1.95,
  'vector database': 1.9, 'fine-tuning': 1.85, 'machine learning': 1.85,
  'deep learning': 1.80, 'nlp': 1.75, 'computer vision': 1.7,
  'pytorch': 1.75, 'tensorflow': 1.65,
  // Languages
  'python': 1.85, 'typescript': 1.75, 'rust': 1.70, 'go': 1.60,
  'kotlin': 1.50, 'swift': 1.45, 'javascript': 1.40,
  'java': 1.25, 'c#': 1.20, 'c++': 1.15, 'php': 0.65, 'perl': 0.30,
  // Frontend
  'react': 1.65, 'next.js': 1.75, 'nextjs': 1.75, 'vue': 1.35,
  'svelte': 1.45, 'angular': 1.20, 'angularjs': 0.45, 'jquery': 0.40,
  // Backend
  'node.js': 1.45, 'nodejs': 1.45, 'express': 1.25, 'fastapi': 1.65,
  'django': 1.30, 'flask': 1.25, 'spring': 1.20,
  // DevOps / Cloud
  'kubernetes': 1.70, 'docker': 1.60, 'terraform': 1.60,
  'helm': 1.45, 'ci/cd': 1.55, 'github actions': 1.55,
  'aws': 1.65, 'azure': 1.55, 'gcp': 1.50, 'firebase': 1.30,
  // Databases
  'postgresql': 1.55, 'redis': 1.50, 'mongodb': 1.35,
  'elasticsearch': 1.35, 'mysql': 1.20, 'sql': 1.35,
  // Tools
  'git': 1.30, 'linux': 1.30, 'graphql': 1.35,
  'microservices': 1.45, 'rest api': 1.30,
  // Declining
  'backbone.js': 0.25, 'grunt': 0.25, 'bower': 0.20, 'flash': 0.05,
  'cobol': 0.40, 'svn': 0.35, 'angular.js': 0.45,
};

export function getDemandIndex(skillName) {
  const n = skillName.toLowerCase().trim();
  if (MARKET_DEMAND[n] !== undefined) return MARKET_DEMAND[n];
  for (const [k, v] of Object.entries(MARKET_DEMAND)) {
    if (n.includes(k) || k.includes(n)) return v;
  }
  return 1.0;
}

/** Compute half-life in years for a given λ */
export function halfLife(lambda) {
  return Math.round((Math.LN2 / lambda) * 10) / 10;
}

/** Core TSDMV computation for a single skill */
export function computeSVS(skill) {
  const lambda     = VOLATILITY[skill.category] ?? 0.20;
  const yearsSince = skill.lastUsedYear
    ? Math.max(0, CURRENT_YEAR - skill.lastUsedYear)
    : 1;
  const decayFactor   = Math.exp(-lambda * yearsSince);
  const marketDemand  = getDemandIndex(skill.name);
  const baseProf      = Math.min(1.0,
    (skill.confidence ?? 0.7) *
    (skill.yearsExperience ? Math.min(skill.yearsExperience / 5, 1.0) : 0.5)
    + 0.3
  );
  const svs = Math.min(1.0, baseProf * decayFactor * marketDemand);

  return {
    svsPercent:         Math.round(svs * 100),
    svs:                Math.round(svs * 1000) / 1000,
    decayFactor:        Math.round(decayFactor * 1000) / 1000,
    marketDemandIndex:  Math.round(marketDemand * 100) / 100,
    baseProficiency:    Math.round(baseProf * 100) / 100,
    halfLifeYears:      halfLife(lambda),
    volatilityConstant: lambda,
    yearsSinceLastUse:  yearsSince,
  };
}

/** Batch compute SVS for all skills in entity graph */
export function batchComputeSVS(skills = []) {
  return skills.map(skill => ({
    name:            skill.name,
    category:        skill.category,
    lastUsedYear:    skill.lastUsedYear,
    yearsExperience: skill.yearsExperience,
    ...computeSVS(skill)
  }));
}

/** Overall skill health score — weighted average of SVS */
export function overallSkillHealth(svsResults) {
  if (!svsResults.length) return 50;
  // Weight top skills more heavily (top 10 by SVS count 2x)
  const sorted = [...svsResults].sort((a, b) => b.svs - a.svs);
  const top = sorted.slice(0, 10);
  const rest = sorted.slice(10);
  const topAvg  = top.reduce((s, x) => s + x.svs, 0) / Math.max(top.length, 1);
  const restAvg = rest.length ? rest.reduce((s, x) => s + x.svs, 0) / rest.length : topAvg;
  return Math.round(((topAvg * 0.7 + restAvg * 0.3)) * 100);
}