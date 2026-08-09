import type {
  AiServiceClient,
  AiServiceHealth,
  DispatchSessionInput,
  DispatchSessionResult,
} from '../interfaces/ai-service-client.interface.js';

/**
 * §9.11 rule 2 — the dev/test default `AiServiceClient`. `dispatchSession`
 * just has to look plausible (no real meeting bot exists to join anything);
 * the actual "drives a realistic full session" behaviour — answers,
 * per-criterion judgements, verdict — lives in
 * `FakeAgentSessionSimulator` (below), used by an integration test or a
 * manual dev script to call the real Agent Session API endpoints exactly as
 * the real AI service eventually will, rather than being invoked by
 * anything in the request path.
 */
export class FakeLlmService implements AiServiceClient {
  dispatchSession(input: DispatchSessionInput): Promise<DispatchSessionResult> {
    return Promise.resolve({
      accepted: true,
      agentSessionRef: `fake-agent-session-${input.sessionId}`,
    });
  }

  cancelSession(_sessionId: string): Promise<void> {
    return Promise.resolve();
  }

  healthCheck(): Promise<AiServiceHealth> {
    return Promise.resolve({ healthy: true, latencyMs: 5 });
  }
}
