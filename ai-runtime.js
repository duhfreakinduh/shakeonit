'use strict';

/* Mobile/browser safeguards for the two-stage AI Judge. */

const visionAnalyzeWithMemoryGuard = analyzeVisualEvidence;
analyzeVisualEvidence = async function guardedAnalyzeVisualEvidence(bet) {
  // Avoid keeping both large models resident at the same time on phones.
  if (aiJudgePipeline?.dispose) {
    try { await aiJudgePipeline.dispose(); } catch (error) { console.warn('Could not dispose text judge before vision analysis.', error); }
  }
  aiJudgePipeline = null;
  aiJudgeLoading = null;

  const observations = await visionAnalyzeWithMemoryGuard(bet);

  if (aiVisionModel?.dispose) {
    try { await aiVisionModel.dispose(); } catch (error) { console.warn('Could not dispose visual model after analysis.', error); }
  }
  aiVisionModel = null;
  aiVisionLoading = null;
  aiVisionLoadMode = null;
  return observations;
};

const visionRenderWithEvidenceCleanup = renderAiJudgeForm;
renderAiJudgeForm = function cleanedRenderAiJudgeForm(bet, preserved = {}) {
  const cleaned = { ...preserved };
  if (typeof cleaned.evidence === 'string') cleaned.evidence = stripGeneratedVisualEvidence(cleaned.evidence);
  const result = visionRenderWithEvidenceCleanup(bet, cleaned);
  // Keep the main picker open to screenshots/gallery instead of forcing camera-only capture.
  document.getElementById('aiVisionInput')?.removeAttribute('capture');
  return result;
};

function stripGeneratedVisualEvidence(value) {
  return String(value || '').split(/\n\nAI VISUAL EVIDENCE OBSERVATIONS \(/)[0].trim();
}
