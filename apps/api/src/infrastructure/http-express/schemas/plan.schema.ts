import { z } from 'zod';

/**
 * Response contract for `GET /api/plan` (ADR-012 §2, ADR-015 §2). `.strict()`
 * → additionalProperties: false.
 */
export const planResponseSchema = z
  .object({
    plan: z
      .enum(['gratis', 'plus'])
      .describe('Plan in force for the session user (PLA-01).'),
    origen: z
      .enum(['suscripcion', 'prueba', 'tester_vitalicio', 'fundador'])
      .nullable()
      .describe(
        'Where Plus comes from: a store subscription, the 30-day trial granted by the API, the lifetime grant of a tester or the Fundador purchase. ' +
          'With more than one in force, the one that lasts longest. null on the free plan.',
      ),
    venceEn: z
      .string()
      .nullable()
      .meta({
        description:
          'When Plus ends (ISO-8601 UTC timestamp): the renewal date of a subscription that renews, or the last day of a cancelled subscription or a trial. ' +
          'null on the free plan and when Plus never expires.',
        example: '2027-01-10T12:00:00.000Z',
      }),
    renueva: z
      .boolean()
      .describe(
        'true only when a store subscription will be charged again at `venceEn`.',
      ),
    producto: z.string().nullable().meta({
      description:
        'Store product identifier of the subscription. null for any other origin.',
      example: 'plus_anual',
    }),
    tienda: z
      .enum(['app_store', 'play_store'])
      .nullable()
      .describe(
        'Store that bills the subscription, where the user cancels it (PLA-04). null for any other origin.',
      ),
  })
  .strict()
  .meta({
    id: 'PlanResponse',
    description:
      'GET /api/plan — the plan of the session user, decided by the API (ADR-012, ADR-015).',
  });
