/**
 * parserAgent.js — Agent A-01: Resume Entity Graph Constructor
 * ─────────────────────────────────────────────────────────────────────────
 * NOVEL CONTRIBUTION: Instead of flat extraction, builds a knowledge graph
 * of entities with relationship weights between skills, roles, and companies.
 *
 * Key innovation: Skill co-occurrence weighting.
 * Skills that appear together in the same role get an association edge.
 * This lets downstream agents understand skill CLUSTERS, not just lists.
 *
 * Example edge: { from: "Python", to: "TensorFlow", weight: 0.9, context: "ML Engineer @ Google" }
 *
 * The parser is always the first task in the PCAM wave scheduler.
 * All other agents depend on its output (entityGraph).
 *
 * PCAM Role:
 *   - Sets: memory["entityGraph"], memory["skillGraph"]
 *   - Reads: nothing (first in chain)
 *   - API calls: Always 1 (bundled in Wave 0 by TaskAggregator)
 */

/**
 * Post-processes the raw parse result from the TaskAggregator.
 * Builds the skill co-occurrence graph locally (no API needed).
 */
export function postProcessEntityGraph(rawParse, memory) {
  // Normalize nested parse key if aggregator returned { parse: {...} }
  const eg = rawParse?.parse || rawParse;

  if (!eg || !eg.contact) {
    throw new Error('Parser agent: invalid entity graph structure from LLM.');
  }

  // ── Build skill co-occurrence graph ──────────────────────────────
  const skillGraph = buildSkillCooccurrenceGraph(eg);
  memory.set('skillGraph', skillGraph, 'parser_agent');

  // ── Compute skill centrality scores ─────────────────────────────
  // Skills with many connections are "hub skills" — more valuable
  const centrality = computeDegreeCentrality(skillGraph);
  memory.set('skillCentrality', centrality, 'parser_agent');

  // ── Annotate skills with centrality ─────────────────────────────
  if (eg.skills) {
    eg.skills = eg.skills.map(s => ({
      ...s,
      centralityScore: centrality[s.name] || 0,
      isHubSkill: (centrality[s.name] || 0) > 0.3
    }));
  }

  // ── Compute career timeline richness ────────────────────────────
  eg._meta = {
    totalBullets:    (eg.experience || []).reduce((a, e) => a + (e.bullets?.length || 0), 0),
    avgBulletsPerRole: eg.experience?.length
      ? Math.round(
          (eg.experience || []).reduce((a, e) => a + (e.bullets?.length || 0), 0) /
          eg.experience.length * 10) / 10
      : 0,
    skillCount:      eg.skills?.length || 0,
    roleCount:       eg.experience?.length || 0,
    skillGraphEdges: skillGraph.edges?.length || 0,
    hubSkills:       eg.skills?.filter(s => s.isHubSkill).map(s => s.name) || [],
  };

  memory.set('entityGraph', eg, 'parser_agent');
  return eg;
}

/**
 * Build skill co-occurrence graph.
 * Two skills share an edge if they appear in the same work experience entry.
 * Edge weight = normalized co-occurrence frequency.
 */
function buildSkillCooccurrenceGraph(eg) {
  const nodes = {};
  const edgeCounts = {};

  for (const exp of (eg.experience || [])) {
    const roleSkills = exp.skills || [];
    // Also extract skills mentioned in bullets
    const bulletSkills = (exp.bullets || []).flatMap(b =>
      (eg.skills || []).filter(s => b.toLowerCase().includes(s.name.toLowerCase())).map(s => s.name)
    );
    const allSkills = [...new Set([...roleSkills, ...bulletSkills])];

    // Register nodes
    for (const s of allSkills) {
      nodes[s] = (nodes[s] || 0) + 1;
    }

    // Register edges (pairs)
    for (let i = 0; i < allSkills.length; i++) {
      for (let j = i + 1; j < allSkills.length; j++) {
        const key = [allSkills[i], allSkills[j]].sort().join('||');
        edgeCounts[key] = (edgeCounts[key] || 0) + 1;
      }
    }
  }

  const maxOccurrence = Math.max(1, ...Object.values(nodes));

  const edges = Object.entries(edgeCounts).map(([key, count]) => {
    const [from, to] = key.split('||');
    return { from, to, weight: Math.round((count / maxOccurrence) * 100) / 100 };
  }).filter(e => e.weight > 0.1); // prune weak edges

  return {
    nodes: Object.entries(nodes).map(([name, freq]) => ({
      name, frequency: freq, normalizedFreq: Math.round(freq / maxOccurrence * 100) / 100
    })),
    edges
  };
}

/**
 * Degree centrality: C(v) = degree(v) / (n - 1)
 * Returns map of skill name → centrality score [0, 1]
 */
function computeDegreeCentrality(skillGraph) {
  const degrees = {};
  const n = skillGraph.nodes?.length || 1;

  for (const edge of (skillGraph.edges || [])) {
    degrees[edge.from] = (degrees[edge.from] || 0) + edge.weight;
    degrees[edge.to]   = (degrees[edge.to]   || 0) + edge.weight;
  }

  const maxDegree = Math.max(1, ...Object.values(degrees));
  const centrality = {};
  for (const [name, deg] of Object.entries(degrees)) {
    centrality[name] = Math.round((deg / maxDegree) * 100) / 100;
  }
  return centrality;
}