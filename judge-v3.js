'use strict';

/* ShakeOnIt Judge v3
   Reliability-first hybrid referee:
   1) instant deterministic rules engine for explicit results,
   2) small Hugging Face zero-shot classifier for fuzzy wording,
   3) guaranteed insufficient-evidence fallback instead of dead UI.

   The classifier is intentionally much smaller than the previous generative LLM.
*/

const JUDGE_V3_IMPORT = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
const JUDGE_V3_MODEL = 'Xenova/mobilebert-uncased-mnli';
const JUDGE_V3_TIMEOUT_MS = 9000;

let judgeV3Classifier = null;
let judgeV3Loading = null;
let judgeV3LastAi = null;

aiJudgeModelLabel = function judgeV3ModelLabel() {
  return 'MobileBERT AI + instant referee';
};

runAiJudge = async function judgeV3Run(id) {
  const bet = state.bets.find(item => Number(item.id) === Number(id));
  if (!bet || bet.status !== 'active') return;

  const facts = String(document.getElementById('aiFactsInput')?.value || '').trim();
  const evidence = String(document.getElementById('aiEvidenceInput')?.value || '').trim();

  if (facts.length < 6) {
    updateAiJudgeStatus('Tell the judge what happened first.');
    return;
  }

  const local = instantReferee(bet, facts, evidence);
  const button = document.querySelector('#aiJudgeModal .ai-judge-btn');
  if (button) button.disabled = true;
  setVisionControlsDisabled?.(true);

  // Never let photo AI block the judge. Photos remain visible to the players,
  // but Judge v3 only uses typed facts/evidence until mobile vision is proven stable.
  const photoCount = Array.isArray(aiVisionFiles) ? aiVisionFiles.length : 0;
  const photoNote = photoCount
    ? `${photoCount} photo${photoCount === 1 ? '' : 's'} attached. For reliable phone judging, describe what the photo proves in the written evidence box.`
    : '';

  try {
    // If the written result is explicit, show a usable ruling immediately.
    // AI verification then runs in the background and may strengthen or challenge it.
    if (local.decision !== 'insufficient' && local.confidence >= 90) {
      const immediate = makePendingRuling(bet, facts, evidence, local, {
        engine: 'instant-referee',
        aiVerification: 'checking',
        photoNote
      });
      aiJudgePendingRuling = immediate;
      renderAiJudgeRuling(bet, immediate);
      addJudgeV3Banner('Instant ruling ready. Hugging Face AI is checking it in the background.', 'checking');

      verifyWithClassifier(bet, facts, evidence, local)
        .then(ai => applyBackgroundVerification(bet, local, ai))
        .catch(error => {
          console.warn('Background AI verification unavailable.', error);
          addJudgeV3Banner('Instant referee result is still usable. AI verification was unavailable.', 'fallback');
        });
      return;
    }

    updateAiJudgeStatus('AI Judge is comparing the evidence…');

    let ai = null;
    try {
      ai = await withTimeout(
        verifyWithClassifier(bet, facts, evidence, local),
        JUDGE_V3_TIMEOUT_MS,
        'AI verification is taking too long.'
      );
    } catch (error) {
      console.warn('Judge v3 classifier fallback.', error);
    }

    const final = combineJudgeResults(local, ai, bet);
    aiJudgePendingRuling = makePendingRuling(bet, facts, evidence, final, {
      engine: ai ? 'mobilebert-zero-shot' : 'instant-referee-fallback',
      aiVerification: ai ? 'complete' : 'unavailable',
      photoNote
    });
    renderAiJudgeRuling(bet, aiJudgePendingRuling);

    if (!ai) {
      addJudgeV3Banner('The Hugging Face classifier was unavailable, so the built-in referee handled this case.', 'fallback');
    } else {
      addJudgeV3Banner(`AI check complete • ${Math.round(ai.confidence)}%`, 'verified');
    }
  } catch (error) {
    console.error('Judge v3 unexpected error.', error);

    // Hard guarantee: the button still returns a safe ruling.
    const safe = local.decision !== 'insufficient' ? local : {
      decision: 'insufficient',
      winner: null,
      confidence: 0,
      summary: 'The judge could not verify a winner from the submitted evidence.',
      reasons: ['The AI engine failed, so the app refused to guess.'],
      missingEvidence: ['State the final result clearly in the facts/evidence box, including the winning player and score or event.']
    };

    aiJudgePendingRuling = makePendingRuling(bet, facts, evidence, safe, {
      engine: 'safe-fallback',
      aiVerification: 'failed',
      photoNote,
      runtimeError: friendlyJudgeV3Error(error)
    });
    renderAiJudgeRuling(bet, aiJudgePendingRuling);
    addJudgeV3Banner(`AI unavailable: ${friendlyJudgeV3Error(error)} The built-in referee still returned a safe ruling.`, 'fallback');
  } finally {
    if (button) button.disabled = false;
    setVisionControlsDisabled?.(false);
  }
};

function instantReferee(bet, facts, evidence) {
  const text = `${facts}\n${evidence}`.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  if (/\b(draw|tie|tied|dead heat|even)\b/i.test(text)) {
    return {
      decision: 'draw',
      winner: null,
      confidence: 98,
      summary: 'The submitted result explicitly says the challenge ended in a draw or tie.',
      reasons: ['The written evidence directly states a tied result.'],
      missingEvidence: []
    };
  }

  const explicit = [];
  for (const name of bet.participants) {
    const n = escapeRegExp(name);
    const patterns = [
      new RegExp(`\\b${n}\\s+(?:won|wins|is\\s+the\\s+winner|was\\s+the\\s+winner|finished\\s+first|came\\s+first|got\\s+there\\s+first)\\b`, 'i'),
      new RegExp(`\\bwinner\\s*(?::|-|is)?\\s*${n}\\b`, 'i'),
      new RegExp(`\\b${n}\\b.{0,55}\\b(?:reached|made|hit|got|completed|finished)\\b.{0,35}\\bfirst\\b`, 'i'),
      new RegExp(`\\b${n}\\s+(?:beat|defeated)\\s+`, 'i')
    ];
    if (patterns.some(pattern => pattern.test(text))) explicit.push(name);
  }

  const uniqueExplicit = [...new Set(explicit)];
  if (uniqueExplicit.length === 1) {
    return {
      decision: 'winner',
      winner: uniqueExplicit[0],
      confidence: 98,
      summary: `${uniqueExplicit[0]} is explicitly identified as the winner in the submitted result.`,
      reasons: ['The written facts directly name the winner.'],
      missingEvidence: []
    };
  }
  if (uniqueExplicit.length > 1) {
    return {
      decision: 'insufficient',
      winner: null,
      confidence: 20,
      summary: 'The submitted facts appear to name more than one winner.',
      reasons: ['The written result is internally conflicting.'],
      missingEvidence: ['Clarify the single final winner or state that the result was a draw.']
    };
  }

  const scoreResult = scoreBasedReferee(bet, text);
  if (scoreResult) return scoreResult;

  return {
    decision: 'insufficient',
    winner: null,
    confidence: 35,
    summary: 'The written facts do not explicitly prove a winner yet.',
    reasons: ['No unambiguous winner statement or rule-compatible final score was found.'],
    missingEvidence: ['State who won and the final score/result, or describe the exact event that satisfied the winning rule.']
  };
}

function scoreBasedReferee(bet, text) {
  // Only auto-score when the rule clearly says high/most or low/least wins.
  // This avoids inventing logic for over/under or yes/no bets that do not store each player\'s pick.
  const rule = `${bet.title || ''} ${bet.rules || ''}`.toLowerCase();
  const highWins = /\b(highest|higher|most|more|largest|greatest|top score|most points|most goals|most wins)\b/.test(rule);
  const lowWins = /\b(lowest|lower|least|fewest|smallest|minimum|closest to zero)\b/.test(rule);
  if (!highWins && !lowWins) return null;

  const scores = [];
  for (const name of bet.participants) {
    const n = escapeRegExp(name);
    const patterns = [
      new RegExp(`\\b${n}\\b\\s*(?:had|has|got|scored|score|was|=|:|-)?\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`\\b${n}\\b.{0,20}?(\\d+(?:\\.\\d+)?)`, 'i')
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        scores.push({ name, value: Number(match[1]) });
        break;
      }
    }
  }

  if (scores.length < 2 || scores.some(item => !Number.isFinite(item.value))) return null;
  const sorted = [...scores].sort((a, b) => highWins ? b.value - a.value : a.value - b.value);
  if (sorted.length > 1 && sorted[0].value === sorted[1].value) {
    return {
      decision: 'draw',
      winner: null,
      confidence: 92,
      summary: `The top qualifying scores are tied at ${sorted[0].value}.`,
      reasons: ['The written rule is score-based and the leading values are equal.'],
      missingEvidence: []
    };
  }

  return {
    decision: 'winner',
    winner: sorted[0].name,
    confidence: 94,
    summary: `${sorted[0].name} has the ${highWins ? 'highest' : 'lowest'} submitted score (${sorted[0].value}) under the written rule.`,
    reasons: [`The rule says the ${highWins ? 'highest/most' : 'lowest/least'} result wins.`, `Submitted scores: ${scores.map(item => `${item.name} ${item.value}`).join(', ')}.`],
    missingEvidence: []
  };
}

async function verifyWithClassifier(bet, facts, evidence, local) {
  const classifier = await loadJudgeV3Classifier();
  const premise = [
    `Challenge: ${bet.title}`,
    `Winning rule: ${bet.rules || bet.title}`,
    `Players: ${bet.participants.join(', ')}`,
    `What happened: ${facts}`,
    `Evidence: ${evidence || 'No additional evidence.'}`
  ].join('\n');

  const winnerLabels = bet.participants.map(name => `${name} is the winner`);
  const drawLabel = 'the result is a draw';
  const insufficientLabel = 'there is not enough evidence to determine the winner';
  const labels = [...winnerLabels, drawLabel, insufficientLabel];

  const result = await classifier(premise, labels, {
    multi_label: true,
    hypothesis_template: 'Based on the challenge evidence, {}.'
  });

  const pairs = result.labels.map((label, index) => ({ label, score: Number(result.scores[index] || 0) }));
  pairs.sort((a, b) => b.score - a.score);

  const top = pairs[0] || { label: insufficientLabel, score: 0 };
  const second = pairs[1] || { score: 0 };
  const insufficient = pairs.find(item => item.label === insufficientLabel)?.score || 0;
  const draw = pairs.find(item => item.label === drawLabel)?.score || 0;

  const matchedPlayer = bet.participants.find(name => top.label === `${name} is the winner`);
  if (matchedPlayer && top.score >= 0.68 && top.score - second.score >= 0.08 && insufficient < 0.55) {
    return {
      decision: 'winner',
      winner: matchedPlayer,
      confidence: Math.round(top.score * 100),
      summary: `The Hugging Face classifier most strongly supports ${matchedPlayer} as the winner.`,
      reasons: [`AI support score: ${Math.round(top.score * 100)}%.`, `Next-best interpretation: ${Math.round(second.score * 100)}%.`],
      missingEvidence: [],
      scores: pairs
    };
  }

  if (draw >= 0.72 && draw >= insufficient + 0.08) {
    return {
      decision: 'draw',
      winner: null,
      confidence: Math.round(draw * 100),
      summary: 'The Hugging Face classifier most strongly supports a draw.',
      reasons: [`AI draw score: ${Math.round(draw * 100)}%.`],
      missingEvidence: [],
      scores: pairs
    };
  }

  return {
    decision: 'insufficient',
    winner: null,
    confidence: Math.round(Math.max(insufficient, 1 - top.score) * 100),
    summary: 'The AI could not confidently identify a single winner from the submitted evidence.',
    reasons: [`Top AI interpretation was only ${Math.round(top.score * 100)}% supportive.`],
    missingEvidence: ['Give the final score/result or state exactly which player satisfied the winning rule.'],
    scores: pairs
  };
}

async function loadJudgeV3Classifier() {
  if (judgeV3Classifier) return judgeV3Classifier;
  if (judgeV3Loading) return judgeV3Loading;

  judgeV3Loading = (async () => {
    updateAiJudgeStatus('Loading small Hugging Face referee… first use downloads about 30 MB.');
    const { pipeline, env } = await import(JUDGE_V3_IMPORT);
    if (env) {
      env.allowLocalModels = false;
      if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
    }
    const pipe = await pipeline('zero-shot-classification', JUDGE_V3_MODEL, {
      dtype: 'q4',
      progress_callback: info => {
        const pct = progressPercent(info);
        const file = info?.file ? String(info.file).split('/').pop() : '';
        updateAiJudgeStatus(file ? `Loading referee: ${file}` : 'Loading small Hugging Face referee…', pct);
      }
    });
    judgeV3Classifier = pipe;
    return pipe;
  })().catch(error => {
    judgeV3Loading = null;
    judgeV3Classifier = null;
    throw error;
  });

  return judgeV3Loading;
}

function combineJudgeResults(local, ai, bet) {
  if (!ai) return local;

  // Agreement is strongest.
  if (local.decision === 'winner' && ai.decision === 'winner' && local.winner === ai.winner) {
    return {
      ...local,
      confidence: Math.max(local.confidence, ai.confidence),
      summary: `${local.winner} wins. The written-result referee and Hugging Face AI agree.`,
      reasons: [...new Set([...(local.reasons || []), ...(ai.reasons || [])])].slice(0, 4),
      missingEvidence: []
    };
  }
  if (local.decision === 'draw' && ai.decision === 'draw') {
    return {
      ...local,
      confidence: Math.max(local.confidence, ai.confidence),
      summary: 'Draw. The written-result referee and Hugging Face AI agree.',
      reasons: [...new Set([...(local.reasons || []), ...(ai.reasons || [])])].slice(0, 4)
    };
  }

  // Explicit written results beat a fuzzy classifier, but conflicts are disclosed.
  if (local.decision !== 'insufficient' && local.confidence >= 90) {
    if (ai.decision !== 'insufficient' && (ai.decision !== local.decision || ai.winner !== local.winner)) {
      return {
        decision: 'insufficient',
        winner: null,
        confidence: 45,
        summary: 'The written result and AI interpretation conflict, so the app refused to guess.',
        reasons: [`Instant referee: ${local.winner || local.decision}.`, `AI interpretation: ${ai.winner || ai.decision}.`],
        missingEvidence: ['Clarify the final score/result in one unambiguous sentence.']
      };
    }
    return local;
  }

  // When local parsing cannot decide, allow strong AI evidence.
  if (ai.decision === 'winner' && ai.confidence >= 72 && bet.participants.includes(ai.winner)) return ai;
  if (ai.decision === 'draw' && ai.confidence >= 75) return ai;

  return {
    decision: 'insufficient',
    winner: null,
    confidence: Math.max(local.confidence || 0, ai.confidence || 0),
    summary: 'There is not enough unambiguous evidence to safely declare a winner.',
    reasons: [...new Set([...(local.reasons || []), ...(ai.reasons || [])])].slice(0, 4),
    missingEvidence: [...new Set([...(local.missingEvidence || []), ...(ai.missingEvidence || [])])].slice(0, 4)
  };
}

function makePendingRuling(bet, facts, evidence, ruling, meta = {}) {
  return {
    ...ruling,
    facts,
    evidence,
    model: JUDGE_V3_MODEL,
    judgedAt: Date.now(),
    judgeVersion: 'v3',
    engine: meta.engine || 'hybrid',
    aiVerification: meta.aiVerification || 'unknown',
    ...(meta.photoNote ? { photoNote: meta.photoNote } : {}),
    ...(meta.runtimeError ? { runtimeError: meta.runtimeError } : {}),
    evidencePolicy: 'Judge v3 uses typed facts/evidence. Photo AI is non-blocking and is not required for a ruling.'
  };
}

function applyBackgroundVerification(bet, local, ai) {
  judgeV3LastAi = ai;
  if (!aiJudgePendingRuling || Number(aiJudgeActiveBetId) !== Number(bet.id)) return;
  if (bet.status !== 'active') return;

  const combined = combineJudgeResults(local, ai, bet);
  aiJudgePendingRuling = {
    ...aiJudgePendingRuling,
    ...combined,
    engine: 'instant-referee + mobilebert',
    aiVerification: 'complete',
    aiScores: ai.scores
  };

  if (!document.getElementById('aiJudgeModal')?.classList.contains('hidden')) {
    renderAiJudgeRuling(bet, aiJudgePendingRuling);
    addJudgeV3Banner(
      combined.decision === local.decision && combined.winner === local.winner
        ? `Hugging Face AI verified the instant ruling • ${Math.round(ai.confidence)}%`
        : 'AI check finished. The displayed ruling has been updated.',
      'verified'
    );
  }
}

function addJudgeV3Banner(message, stateName = 'verified') {
  const body = document.querySelector('#aiJudgeSheet .modal-body');
  if (!body) return;
  body.querySelector('.judge-v3-banner')?.remove();
  const el = document.createElement('div');
  el.className = `judge-v3-banner ${stateName}`;
  el.innerHTML = `<strong>Judge v3</strong><span>${aiJudgeEscape(message)}</span>`;
  body.prepend(el);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function friendlyJudgeV3Error(error) {
  const raw = String(error?.message || error || 'Unknown error');
  if (/fetch|network|internet/i.test(raw)) return 'model download/network error';
  if (/memory|allocation|buffer/i.test(raw)) return 'browser memory error';
  if (/wasm|worker/i.test(raw)) return 'browser AI engine error';
  return raw.slice(0, 120);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
