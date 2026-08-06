// Shared contracts imported by more than one module (ARCHITECTURE §4.2).
// Provider interfaces, JWT claims, job payload types and config shapes live
// here; request/response/filter DTOs stay in each module's `dto/`.

export interface JwtAccessClaims {
  sub: string;
  orgId: string;
  role: string;
  locale: string;
}
