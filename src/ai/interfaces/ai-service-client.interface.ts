// ARCHITECTURE §9.11 — the outbound half of the AI team seam. Deliberately
// three methods; see §9.11's rejected-methods table (D-18) for why
// `generateRecommendation`/`evaluateAnswer`/`generateReport` must never be
// added here. The inbound half (their calls into us) is the Agent Session
// API routes, not this interface.

export interface DispatchSessionInput {
  sessionId: string;
  joinUrl: string;
  scheduledStart: string;
  learnerDisplayName: string;
  language: 'EN' | 'AR';
}

export interface DispatchSessionResult {
  accepted: boolean;
  agentSessionRef?: string | undefined;
}

export interface AiServiceHealth {
  healthy: boolean;
  latencyMs?: number | undefined;
}

/** Us → AI service. Used only where we must initiate (§9.11 table). */
export interface AiServiceClient {
  dispatchSession(input: DispatchSessionInput): Promise<DispatchSessionResult>;
  cancelSession(sessionId: string): Promise<void>;
  healthCheck(): Promise<AiServiceHealth>;
}
