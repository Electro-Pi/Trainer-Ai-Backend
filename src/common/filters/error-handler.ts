import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import {
  AppError,
  InternalError,
  ValidationError,
  type ValidationIssue,
} from '@/common/exceptions/app-error.js';
import { t } from '@/i18n/index.js';
import type { Logger } from '@/logger/logger.service.js';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
  errors?: ValidationIssue[];
}

function zodIssuesToValidationIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * Express 5 error middleware (4-arg signature is what makes Express treat
 * this as an error handler — do not drop the unused `next` param). Mounted
 * LAST in app.ts. Never leaks Prisma/internal error text: unrecognized
 * errors are logged in full here and returned to the client as a generic,
 * localized detail only.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const locale = req.locale ?? 'en';
    const instance = req.originalUrl;
    const requestId = req.requestId ?? 'unknown';

    const appError = normalizeToAppError(err);

    if (appError.status >= 500) {
      logger.error({ err, requestId, instance }, 'Unhandled error');
    } else {
      logger.warn({ err: appError.message, requestId, instance }, 'Request failed');
    }

    const title = t(appError.titleKey, locale);
    const genericDetail = t(`${appError.titleKey.replace('.title', '.detail')}`, locale);

    const body: ProblemDetails = {
      type: appError.type,
      title,
      status: appError.status,
      detail: appError.status >= 500 ? genericDetail : (appError.detail ?? genericDetail),
      instance,
      requestId,
    };

    if (appError.errors && appError.errors.length > 0) {
      body.errors = appError.errors;
    }

    res.status(appError.status).type('application/problem+json').json(body);
  };
}

function normalizeToAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof ZodError) {
    return new ValidationError(zodIssuesToValidationIssues(err));
  }

  return new InternalError(undefined, err);
}
