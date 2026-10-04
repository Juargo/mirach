import type { z } from 'zod';

/**
 * Test-only: the problems of a real response body against the zod schema the
 * OpenAPI document is built from. The schema is checked as `additionalProperties:
 * false` (what the spec declares), so an extra or missing property is reported.
 * An empty array means emitter and spec agree.
 */
export function bodyIssues(
  schema: z.ZodObject,
  body: unknown,
): readonly string[] {
  const parsed = schema.strict().safeParse(body);
  return parsed.success
    ? []
    : parsed.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      );
}
