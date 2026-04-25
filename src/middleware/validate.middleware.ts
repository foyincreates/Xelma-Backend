import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * Express middleware that validates request data against a Zod schema.
 * Uses safeParse for all request segments and returns consistent 4xx error payloads.
 * On failure, forwards a ValidationError to the centralized error handler.
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        // Zod v4 stores errors in error.message as JSON string
        let errorData: any[];
        try {
          errorData = JSON.parse(result.error.message);
        } catch {
          // Fallback if error.message is not valid JSON
          errorData = [{ path: [], message: 'Invalid request format' }];
        }
        const details = errorData.map((e: any) => ({
          field: e.path?.join('.') || 'unknown',
          message: e.message || 'Validation failed',
        }));
        return next(new ValidationError(details[0]?.message || 'Validation failed', details));
      }
      (req as any)[source] = result.data;
      next();
    } catch (error) {
      // Catch any unexpected parsing errors
      next(new ValidationError('Invalid request format'));
    }
  };
}
