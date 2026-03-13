/**
 * pcamOrchestrator.js — Predictive Cooperative Agent Mesh (PCAM) v3.0
 */
import { createClient }        from '../services/geminiClient.js';
import { SharedMemory }        from '../core/sharedMemory.js';
import { PredictiveGate }      from '../core/predictiveGate.js';
import { TaskAggregator }      from '../core/taskAggregator.js';
import { analyzeIntent }       from '../core/intentAnalyzer.js';
import { batchComputeSVS }     from '../core/tsdmv.js';

import { postProcessEntityGraph }       from './parserAgent.js';
import { postProcessATS }               from './atsAgent.js';
import { postProcessSkillIntelligence } from './skillAgent.js';
import { postProcessFeedback }          from './feedbackAgent.js';
import { postProcessCareerTrajectory }  from './careerAgent.js';
import { postProcessReconstruction }    from './csrreAgent.js';

const TASK_ORDER = ['parse', 'ats', 'skills', 'career', 'feedback', 'reconstruct'];

export async function runPCAM(resumeText, jobDescription, apiKey) {
  const startTime = Date.now();
  const mem  = new SharedMemory();
  const gate = new PredictiveGate();

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  PCAM v3.0 — Predictive Cooperative Mesh  ║');
  console.log('╚════════════════════════════════════════════╝');

  // [1] Intent Analysis
  const intent = analyzeIntent(resumeText, jobDescription);
  if (!intent.is_valid_resume) throw new Error('Input does not appear to be a resume. Please check your input.');

  // [2] Predictive Gate
  console.log('\n[2] Predictive Gate:');
  const approvedTasks = [];
  const gateContext = { resumeLength: resumeText.length, hasJD: !!(jobDescription?.trim().length > 20), intentSignals: intent.signals };

  for (const task of TASK_ORDER) {
    const d = gate.evaluate(task, mem, intent, gateContext);
    console.log(`  ${d.allow ? '✓' : '✗'} ${task.padEnd(12)} | ${d.reason.padEnd(24)} | CV:${d.callValue?.toFixed(3) ?? 'N/A'}`);
    if (d.allow) approvedTasks.push(task);
    else if (d.heuristicResult) storeResult(task, d.heuristicResult, mem);
  }

  // [3] Task Aggregator — wave batching
  const model = createClient(apiKey);
  const aggregator = new TaskAggregator(model, mem);
  console.log(`\n[3] Aggregator — approved: [${approvedTasks.join(', ')}]`);
  await aggregator.executeAll(approvedTasks, resumeText, jobDescription);

  // [4] TSDMV local (zero API)
  const eg = normalizeEG(mem.get('entityGraph') || mem.get('result_parse') || {});
  mem.set('entityGraph', eg, 'normalize');
  if (eg?.skills?.length) {
    mem.set('localSVS', batchComputeSVS(eg.skills), 'tsdmv_local');
    console.log(`\n[4] TSDMV: ${eg.skills.length} skills computed locally (0 API calls)`);
  }

  // [5] Agent post-processors
  console.log('\n[5] Post-processing:');
  safeRun('A-01 Parser',    () => postProcessEntityGraph(eg, mem));
  safeRun('A-02 ATS',       () => postProcessATS(mem.get('atsResult') || mem.get('result_ats') || {}, eg, jobDescription, mem));
  safeRun('A-03 Skills',    () => postProcessSkillIntelligence(mem.get('skillIntelligence') || mem.get('result_skills') || {}, eg, mem));
  safeRun('A-04 Feedback',  () => postProcessFeedback(mem.get('feedbackAnalysis') || mem.get('result_feedback') || {}, eg, mem));
  safeRun('A-05 Career',    () => postProcessCareerTrajectory(mem.get('careerTrajectory') || mem.get('result_career') || {}, mem.get('skillIntelligence'), eg, mem));
  safeRun('A-06 CSRRE',     () => postProcessReconstruction(mem.get('reconstruction') || mem.get('result_reconstruct') || {}, mem.get('feedbackAnalysis'), mem.get('atsResult'), eg, mem));

  const stats = mem.getStats();
  const totalTime = Date.now() - startTime;
  console.log(`\n✓ PCAM done — ${totalTime}ms | API calls: ${stats.totalApiCalls} | Saved: ${stats.callsSaved} | ${stats.efficiency}\n`);

  return {
    metadata: {
      analysisId: `pcam_${Date.now()}`, timestamp: new Date().toISOString(),
      totalProcessingTimeMs: totalTime, resumeLength: resumeText.length,
      jobDescriptionProvided: !!(jobDescription?.trim().length > 20),
      architecture: 'PCAM-3.0', aiBackend: 'Gemini 2.5 Flash',
      novelComponents: [
        'Predictive API Gate (IG/cost gating)','Speculative Agent Reasoning',
        'Shared Context Memory','Task Aggregator (wave batching)','TSDMV-ECO',
        'SCIS-CL (Cognitive Load + Attention)','PASE-ADV (Adversarial + Stackelberg)',
        'MCTE (Markov Career Trajectory)','CSRRE-EVO (Evolutionary Reconstruction)',
        'Skill Co-occurrence Graph + Centrality',
      ],
      pcamStats: { totalApiCalls: stats.totalApiCalls, callsSaved: stats.callsSaved, efficiency: stats.efficiency, approvedTasks, tsdmvLocalCompute: true, memoryKeys: stats.memoryKeys }
    },
    entityGraph:       mem.get('entityGraph')       || {},
    atsResult:         mem.get('atsResult')         || {},
    skillIntelligence: mem.get('skillIntelligence') || {},
    careerTrajectory:  mem.get('careerTrajectory')  || {},
    feedbackAnalysis:  mem.get('feedbackAnalysis')  || {},
    reconstruction:    mem.get('reconstruction')    || {},
  };
}

function storeResult(task, result, mem) {
  const map = { parse:'entityGraph', ats:'atsResult', skills:'skillIntelligence', career:'careerTrajectory', feedback:'feedbackAnalysis', reconstruct:'reconstruction' };
  if (map[task]) mem.set(map[task], result, 'gate_speculative');
}

function normalizeEG(eg) {
  if (eg?.parse?.contact) return eg.parse;
  if (eg?.contact) return eg;
  return eg;
}

function safeRun(label, fn) {
  try { console.log(`  ${label}`); fn(); }
  catch(e) { console.error(`  ${label} ERROR: ${e.message}`); }
}