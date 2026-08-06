const ERROR_BASE_URL = 'https://modrb.app/errors';

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface AppErrorOptions {
  detail?: string | undefined;
  errors?: ValidationIssue[] | undefined;
  cause?: unknown;
}

/**
 * RFC 9457 `application/problem+json` base error. `title`/`detail` are i18n
 * keys resolved by the error handler (P0-5's filters/error-handler.ts) via
 * `t()`, not literal display strings — this keeps every AppError localizable
 * without callers touching i18n.
 */
export abstract class AppError extends Error {
  abstract readonly type: string;
  abstract readonly titleKey: string;
  abstract readonly status: number;

  readonly detail: string | undefined;
  readonly errors: ValidationIssue[] | undefined;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.detail = options.detail;
    this.errors = options.errors;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  readonly type = `${ERROR_BASE_URL}/validation-failed`;
  readonly titleKey = 'errors.validationFailed.title';
  readonly status = 422;

  constructor(errors: ValidationIssue[], detail?: string) {
    super('Validation failed', { detail, errors });
  }
}

export class UnauthorizedError extends AppError {
  readonly type = `${ERROR_BASE_URL}/unauthorized`;
  readonly titleKey = 'errors.unauthorized.title';
  readonly status = 401;

  constructor(detail?: string) {
    super('Unauthorized', { detail });
  }
}

export class ForbiddenError extends AppError {
  readonly type = `${ERROR_BASE_URL}/forbidden`;
  readonly titleKey = 'errors.forbidden.title';
  readonly status = 403;

  constructor(detail?: string) {
    super('Forbidden', { detail });
  }
}

export class NotFoundError extends AppError {
  readonly type = `${ERROR_BASE_URL}/not-found`;
  readonly titleKey = 'errors.notFound.title';
  readonly status = 404;

  constructor(detail?: string) {
    super('Not found', { detail });
  }
}

export class ConflictError extends AppError {
  readonly type = `${ERROR_BASE_URL}/conflict`;
  readonly titleKey = 'errors.conflict.title';
  readonly status = 409;

  constructor(detail?: string) {
    super('Conflict', { detail });
  }
}

export class RateLimitError extends AppError {
  readonly type = `${ERROR_BASE_URL}/rate-limited`;
  readonly titleKey = 'errors.rateLimited.title';
  readonly status = 429;

  constructor(detail?: string) {
    super('Too many requests', { detail });
  }
}

export class ExternalServiceError extends AppError {
  readonly type = `${ERROR_BASE_URL}/external-service`;
  readonly titleKey = 'errors.externalService.title';
  readonly status = 502;

  constructor(detail?: string, cause?: unknown) {
    super('External service error', { detail, cause });
  }
}

export class InternalError extends AppError {
  readonly type = `${ERROR_BASE_URL}/internal`;
  readonly titleKey = 'errors.internal.title';
  readonly status = 500;

  constructor(detail?: string, cause?: unknown) {
    super('Internal server error', { detail, cause });
  }
}
