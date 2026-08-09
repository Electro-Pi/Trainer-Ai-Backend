import { clamp01, type SignalContext } from './signal.types.js';

/** Weight 0.20 (ARCHITECTURE §8.1, `RC-03`). Carried-over outcomes are always maximally due; otherwise lower `priority` (set by the manager, `LV-05`) scores higher, decaying over the first 10 ranks. */
export function outcomePrioritySignal(context: SignalContext): number {
  if (context.isCarriedOver) return 1;
  return clamp01(1 - context.outcomePriority / 10);
}
