/**
 * intentAnalyzer.js — PCAM Component 1
 * ─────────────────────────────────────────────────────────────────────────
 * Analyzes the user's input before any agent runs.
 * Produces an intent vector that prevents unnecessary agents from activating.
 *
 * Novel contribution: most agent systems run ALL agents regardless of need.
 * Intent analysis selectively enables only the agents that can add value
 * given the available inputs — reducing API calls at the architectural level.
 *
 * Formula:
 *   intent_score(agent) = Σ(signal_weight × signal_present) / total_possible
 *   agent activates if intent_score ≥ activation_threshold
 */

export function analyzeIntent(resumeText, jobDescription) {
  const resume = resumeText.trim();
  const jd     = (jobDescription || '').trim();

  // Detect resume richness signals
  const signals = {
    hasBullets:       /[•\-\*]|^\s*[-–•]/m.test(resume),
    hasQuantification:/\d+\s*(%|percent|x\b|\$|users|revenue|million|team|days)/i.test(resume),
    hasRoles:         /(engineer|developer|manager|analyst|designer|lead|architect|scientist)/i.test(resume),
    hasSkillsSection: /(skills|technologies|tech stack|tools|languages)/i.test(resume),
    hasEducation:     /(university|college|bachelor|master|phd|degree|b\.tech|b\.e\.)/i.test(resume),
    hasExperience:    /(experience|worked|employed|internship|position)/i.test(resume),
    hasProjects:      /(project|built|developed|created|launched)/i.test(resume),
    hasCertifications:/(certified|certification|aws|google cloud|azure|coursera|udemy)/i.test(resume),
    resumeLength:     resume.length,
    hasJD:            jd.length > 50,
    jdHasRequirements:/(required|must have|preferred|qualifications)/i.test(jd),
    jdHasSkills:      /(python|java|react|node|sql|aws|docker|machine learning)/i.test(jd),
  };

  // Intent vector — which analysis modules are worthwhile
  const intent = {
    // Always run
    requires_parsing:      true,

    // Run ATS only if there's meaningful JD content
    requires_ats:          signals.hasJD,

    // Run skill intel if resume has skills section OR long enough resume
    requires_skill_intel:  signals.hasSkillsSection || signals.resumeLength > 500,

    // Run career prediction only if we have role history
    requires_career:       signals.hasRoles || signals.hasExperience,

    // Run SCIS feedback only if there are bullet points to score
    requires_feedback:     signals.hasBullets || signals.hasExperience,

    // Run CSRRE reconstruction only if we have something to improve
    requires_reconstruction: signals.hasBullets || signals.hasSkillsSection,

    // Confidence that this is actually a resume (not random text)
    is_valid_resume: (
      (signals.hasRoles ? 1 : 0) +
      (signals.hasExperience ? 1 : 0) +
      (signals.hasSkillsSection ? 1 : 0) +
      (signals.hasEducation ? 1 : 0)
    ) >= 2,

    signals
  };

  // Compute activation count to understand complexity
  intent.activeAgentCount = [
    intent.requires_parsing,
    intent.requires_ats,
    intent.requires_skill_intel,
    intent.requires_career,
    intent.requires_feedback,
    intent.requires_reconstruction,
  ].filter(Boolean).length;

  return intent;
}