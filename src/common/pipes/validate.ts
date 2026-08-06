import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

import { ValidationError, type ValidationIssue } from '@/common/exceptions/app-error.js';

export interface ValidateSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Parses `req.body`/`req.query`/`req.params` against the given Zod schemas
 * and reassigns the parsed (and coerced) result back onto `req`. Throws
 * `ValidationError` on failure — Express 5 propagates thrown errors from
 * sync and async handlers alike, so no try/catch wrapper is needed here.
 */
export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ValidationIssue[] = [];

    for (const [target, schema] of Object.entries(schemas) as [
      keyof ValidateSchemas,
      ZodType | undefined,
    ][]) {
      if (!schema) continue;

      const result = schema.safeParse(req[target]);

      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          });
        }
        continue;
      }

      // `req.query` is a getter-only accessor in Express 5 (re-parsed from
      // the URL on every read, no setter) — a plain assignment throws and
      // `Object.assign` into the transient getter result is silently lost
      // on the next read. Redefine the property so parsed/coerced data
      // sticks for downstream handlers.
      Object.defineProperty(req, target, {
        configurable: true,
        enumerable: true,
        value: result.data,
      });
    }

    if (issues.length > 0) {
      throw new ValidationError(issues);
    }

    next();
  };
}
