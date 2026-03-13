/**
 * skillAgent.js — Agent A-03: TSDMV Ecological Skill Intelligence
 * ─────────────────────────────────────────────────────────────────────────
 * NOVEL CONTRIBUTION — Ecological Skill Ecosystem Model
 *
 * Inspired by: population ecology, competitive exclusion principle,
 *              Lotka-Volterra predator-prey dynamics
 *
 * Old TSDMV: Each skill decays independently.
 *
 * New TSDMV-ECO:
 *   Skills exist in an ECOSYSTEM where they compete for recruiter attention.
 *   - "Invasive" skills (e.g., LLM/GenAI) displace older skills in recruiter scoring
 *   - "Keystone" skills (Python, SQL) support many other skills' value
 *   - "Endangered" skills (COBOL, jQuery) lose niche but don't disappear fully
 *
 * Competitive Displacement Score:
 *   displacement(skill_old, skill_new) = σ(SVS_new - SVS_old) × category_overlap
 *   If old and new skill compete for same niche AND SVS_new >> SVS_old:
 *     old skill's effective value drops further
 *
 * Keystone Amplification:
 *   If skill is a "hub" in the skill graph (high centrality):
 *     SVS_amplified = SVS × (1 + centrality_score × 0.3)
 *
 * Portfolio Diversification Score (inspired by Modern Portfolio Theory):
 *   SkillPortfolio_diversity = 1 - Σ(w_i²) where w_i = SVS_i / Σ SVS_j
 *   High diversity = less vulnerable to any single skill obsolescing.
 *
 * PCAM Role:
 *   - Reads: memory["result_skills"] (from aggregator), memory["localSVS"] (from TSDMV engine)
 *             memory["skillGraph"], memory["skillCentrality"]
 *   - Sets: memory["skillIntelligence"] (enriched)
 *   - API calls: 0 (SVS computed by tsdmv.js locally)
 */

import { batchComputeSVS, overallSkillHealth, VOLATILITY, halfLife, getDemandIndex } from '../core/tsdmv.js';

const CURRENT_YEAR = new Date().getFullYear();

// Skill displacement map: if you have skill_new, skill_old loses value
const DISPLACEMENT_MAP = {
  'LLM':          ['Machine Learning', 'NLP', 'Text Mining', 'Keras'],
  'GenAI':        ['Template Engines', 'Manual Content Generation'],
  'Next.js':      ['Create React App', 'webpack', 'React Router'],
  'FastAPI':      ['Flask', 'Tornado'],
  'TypeScript':   ['Flow', 'PropTypes'],
  'Kubernetes':   ['Docker Swarm', 'Mesos'],
  'Terraform':    ['CloudFormation', 'Ansible (partial)'],
  'GitHub Actions': ['Jenkins', 'Travis CI', 'CircleCI'],
  'Vite':         ['webpack', 'Parcel', 'Gulp'],
  'PostgreSQL':   ['MySQL (partial)'],
};

// Keystone skills — losing these hurts the whole portfolio
const KEYSTONE_SKILLS = ['Python', 'JavaScript', 'SQL', 'Git', 'Linux', 'REST API', 'TypeScript'];

/**
 * Full TSDMV-ECO enrichment pipeline.
 * Called after TaskAggregator returns skills data.
 */
export function postProcessSkillIntelligence(rawSkills, entityGraph, memory) {
  const skillData = rawSkills?.skills || rawSkills;
  if (!skillData) return rawSkills;

  const eg         = entityGraph || {};
  const centrality = memory.get('skillCentrality') || {};
  const localSVS   = memory.get('localSVS') || [];

  // ── Step 1: Apply TSDMV-ECO enrichment ──────────────────────────
  const enrichedSkills = enrichWithEcologicalModel(
    skillData.skills || [],
    localSVS,
    centrality,
    eg
  );

  // ── Step 2: Compute competitive displacement ─────────────────────
  applyCompetitiveDisplacement(enrichedSkills);

  // ── Step 3: Portfolio diversity score ────────────────────────────
  const portfolioScore = computePortfolioDiversity(enrichedSkills);

  // ── Step 4: Skill ecosystem analysis ─────────────────────────────
  const ecosystem = analyzeEcosystem(enrichedSkills);

  // ── Step 5: Half-life table ───────────────────────────────────────
  const halfLifeTable = Object.entries(VOLATILITY).map(([cat, λ]) => ({
    category: cat, lambda: λ, halfLifeYears: halfLife(λ),
    interpretation: halfLifeInterp(halfLife(λ))
  }));

  const enriched = {
    ...skillData,
    skills:                 enrichedSkills.sort((a, b) => (b.svsPercent || 0) - (a.svsPercent || 0)),
    overallSkillHealthScore: overallSkillHealth(enrichedSkills.map(s => ({ svs: (s.svsPercent || 50) / 100 }))),
    ecosystemAnalysis:      ecosystem,
    portfolioAnalysis: {
      diversityScore:     portfolioScore,
      diversityGrade:     portfolioScore > 0.7 ? 'Well-diversified' : portfolioScore > 0.4 ? 'Moderately concentrated' : 'Over-specialized',
      keystoneSkills:     enrichedSkills.filter(s => s.isKeystone).map(s => s.name),
      invasiveSkills:     enrichedSkills.filter(s => s.isInvasive).map(s => s.name),
      displacedSkills:    enrichedSkills.filter(s => s.displacementPenalty > 0).map(s => `${s.name} (−${s.displacementPenalty}%)`),
    },
    halfLifeTable,
    marketPositioning: skillData.marketPositioning || buildMarketPositioning(enrichedSkills),
    _tsdmvVersion: 'ECO-2.0',
  };

  memory.set('skillIntelligence', enriched, 'skill_agent');
  return enriched;
}

function enrichWithEcologicalModel(skills, localSVS, centrality, eg) {
  return skills.map(s => {
    const local = localSVS.find(l => l.name?.toLowerCase() === s.name?.toLowerCase());
    const centralityScore = centrality[s.name] || 0;
    const isKeystone = KEYSTONE_SKILLS.some(k => s.name.toLowerCase().includes(k.toLowerCase()));

    // Keystone amplification: hub skills get SVS boost
    const keystoneBonus = isKeystone ? Math.round(centralityScore * 15) : 0;

    // Base SVS from TSDMV local engine
    const baseSVS   = local?.svsPercent || s.svsPercent || 50;
    const amplified = Math.min(99, baseSVS + keystoneBonus);

    // Invasive skill detection
    const isInvasive = (getDemandIndex(s.name) || 1.0) > 1.7 &&
                       (CURRENT_YEAR - (s.lastUsedYear || CURRENT_YEAR)) <= 2;

    return {
      ...s,
      ...(local || {}),
      svsPercent:       amplified,
      centralityScore:  Math.round(centralityScore * 100) / 100,
      isKeystone,
      isInvasive,
      keystoneBonus,
      displacementPenalty: 0, // will be set by applyCompetitiveDisplacement
    };
  });
}

function applyCompetitiveDisplacement(skills) {
  const skillNames = skills.map(s => s.name);

  for (const [invasive, displaced] of Object.entries(DISPLACEMENT_MAP)) {
    const hasInvasive = skillNames.some(n => n.toLowerCase().includes(invasive.toLowerCase()));
    if (!hasInvasive) continue;

    for (const skill of skills) {
      const isDisplaced = displaced.some(d => skill.name.toLowerCase().includes(d.toLowerCase()));
      if (isDisplaced) {
        const penalty = Math.min(20, Math.round(10 + (getDemandIndex(invasive) - 1.0) * 8));
        skill.displacementPenalty = penalty;
        skill.svsPercent = Math.max(5, skill.svsPercent - penalty);
        skill.displacedBy = invasive;
      }
    }
  }
}

function computePortfolioDiversity(skills) {
  if (!skills.length) return 0;
  const total = skills.reduce((s, k) => s + (k.svsPercent || 0), 0);
  if (!total) return 0;
  const weights = skills.map(k => (k.svsPercent || 0) / total);
  const herfindahl = weights.reduce((s, w) => s + w * w, 0); // HHI index
  return Math.round((1 - herfindahl) * 100) / 100;
}

function analyzeEcosystem(skills) {
  const thriving   = skills.filter(s => s.svsPercent >= 70);
  const stressed   = skills.filter(s => s.svsPercent >= 40 && s.svsPercent < 70);
  const endangered = skills.filter(s => s.svsPercent < 40);

  return {
    thrivingSkills:   thriving.slice(0, 5).map(s => s.name),
    stressedSkills:   stressed.slice(0, 5).map(s => s.name),
    endangeredSkills: endangered.slice(0, 5).map(s => s.name),
    ecosystemHealth:  thriving.length > endangered.length ? 'healthy' : thriving.length === endangered.length ? 'stressed' : 'critical',
    biodiversityIndex: Math.round((thriving.length / Math.max(skills.length, 1)) * 100),
    recommendation:   buildEcosystemRecommendation(thriving, stressed, endangered),
  };
}

function buildEcosystemRecommendation(thriving, stressed, endangered) {
  if (endangered.length > thriving.length) {
    return `Critical: ${endangered.length} skills are endangered by market shifts. Focus on transitioning to high-vitality alternatives.`;
  }
  if (stressed.length > 5) {
    return `${stressed.length} skills in stress zone. Refresh recent usage or supplement with growing alternatives.`;
  }
  return `Ecosystem healthy: ${thriving.length} thriving skills. Continue building on your strongest area.`;
}

function buildMarketPositioning(skills) {
  const top = skills.filter(s => s.svsPercent >= 70).slice(0, 3).map(s => s.name);
  if (!top.length) return 'Skill portfolio needs significant refreshing for current market.';
  return `Strong positioning in ${top.join(', ')} — high market demand + recent usage.`;
}

function halfLifeInterp(years) {
  if (years < 2) return 'Highly volatile — update within 1–2 years';
  if (years < 4) return 'Moderate volatility — refresh within 3–4 years';
  if (years < 8) return 'Stable — relevant for 5–8 years without refreshing';
  return 'Foundational — remains relevant long-term';
}