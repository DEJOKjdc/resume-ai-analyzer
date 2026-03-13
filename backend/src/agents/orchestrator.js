/**
 * AGENT A-00: Master Orchestrator — MARIOF
 * Multi-Agent Resume Intelligence Orchestration Framework
 * NOVEL CONTRIBUTION #1 (patent spec IPR0002645P)
 *
 * DAG execution:
 * Phase 1:  A-01 Parser
 * Phase 2:  A-02 ATS  ||  A-03 Skill Intelligence   (parallel)
 * Phase 3:  A-04 Career  ||  A-05 Feedback           (parallel)
 * Phase 4:  CSRRE Reconstruction
 */
import { createClient } from '../services/geminiClient.js';
import { runParserAgent }            from './parserAgent.js';
import { runATSAgent }               from './atsAgent.js';
import { runSkillIntelligenceAgent } from './skillAgent.js';
import { runCareerAgent }            from './careerAgent.js';
import { runFeedbackAgent }          from './feedbackAgent.js';
import { runCSRRE }                  from './csrreAgent.js';

export async function orchestrateAnalysis(resumeText, jobDescription, apiKey) {
  const startTime = Date.now();
  console.log('\n[A-00] MARIOF Orchestrator — DAG execution starting (Gemini backend)');
  console.log(`[A-00] Resume: ${resumeText.length} chars | JD: ${jobDescription ? 'provided' : 'none'}`);

  const model = createClient(apiKey);

  // Phase 1 — Parser (needs up to 4000 tokens for large resumes)
  console.log('[A-00] Phase 1 → A-01 Parser');
  const entityGraph = await runParserAgent(model, resumeText);

  // Phase 2 — parallel (3000 tokens each is enough for focused tasks)
  console.log('[A-00] Phase 2 → A-02 ATS  ||  A-03 Skill (parallel)');
  const [atsResult, skillIntelligence] = await Promise.all([
    runATSAgent(model, entityGraph, jobDescription),
    runSkillIntelligenceAgent(model, entityGraph, jobDescription)
  ]);

  // Phase 3 — parallel
  console.log('[A-00] Phase 3 → A-04 Career  ||  A-05 Feedback (parallel)');
  const [careerTrajectory, feedbackAnalysis] = await Promise.all([
    runCareerAgent(model, entityGraph, skillIntelligence, jobDescription),
    runFeedbackAgent(model, entityGraph, atsResult, skillIntelligence, jobDescription)
  ]);

  // Phase 4 — CSRRE needs more tokens for LaTeX generation
  console.log('[A-00] Phase 4 → CSRRE Reconstruction');
  const reconstruction = await runCSRRE(model, entityGraph, atsResult, feedbackAnalysis, jobDescription);

  const totalTime = Date.now() - startTime;
  console.log(`[A-00] DAG complete in ${totalTime}ms\n`);

  return {
    metadata: {
      analysisId:             `analysis_${Date.now()}`,
      timestamp:              new Date().toISOString(),
      totalProcessingTimeMs:  totalTime,
      resumeLength:           resumeText.length,
      jobDescriptionProvided: !!jobDescription,
      orchestratorVersion:    'MARIOF-2.0-Gemini',
      aiBackend:              'Google Gemini 2.5 Flash',
      dagPhases:              4
    },
    entityGraph,
    atsResult,
    skillIntelligence,
    careerTrajectory,
    feedbackAnalysis,
    reconstruction
  };
}