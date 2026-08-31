# AI / Contributor Guide

This app uses AI as a judge/helper. Reliability matters more than model cleverness: users must always get a usable result even when AI, vision, or network features fail.

## Priorities
1. Keep a deterministic local fallback judge for every AI-dependent flow.
2. Use bounded timeouts; never leave the UI stuck in a loading state.
3. Validate model output before applying it to scores, winners, or game state.
4. Avoid repeated prompts/results by tracking recent inputs and outcomes where appropriate.
5. Do not expose model/provider tokens in browser code.
6. Vision or uploaded-image features must be explicit and explain what data is processed.
7. Keep AI decisions explainable: show a short reason and allow manual override/retry.
8. Preserve normal game setup and play when AI is disabled.

## Before merging
- Test with AI/network completely unavailable.
- Force malformed/empty AI responses and verify fallback.
- Verify loading states always resolve.
- Test manual override/retry paths.
- Check browser console for uncaught errors or leaked data.
