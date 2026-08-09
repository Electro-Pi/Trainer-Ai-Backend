import { clamp01, type SignalContext } from './signal.types.js';

/** Weight 0.10 (ARCHITECTURE §8.1, `RC-13`). `ContentEffectiveness.effectivenessScore` is already 0..1 (computed by `recompute-effectiveness.job`, P10-5); content never delivered before scores a neutral 0.5 rather than 0, so new content isn't buried under proven content. */
export function effectivenessSignal(context: SignalContext): number {
  if (!context.effectiveness || context.effectiveness.timesDelivered === 0) return 0.5;
  return clamp01(context.effectiveness.effectivenessScore);
}
