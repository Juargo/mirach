export const SITE = {
  title: 'MoneyDiary',
  description:
    'Controla tus finanzas personales con la regla 50/30/20. MoneyDiary analiza tus gastos bancarios y te muestra exactamente a dónde va tu dinero.',
  url: 'https://moneydiary.cl',
  ogImage: '/og-image.png',
  twitter: '@moneydiary',
} as const;

export const CTA = {
  /** Set to a TestFlight/Play Store URL when available via PR; fallback to email */
  href: 'mailto:beta@moneydiary.cl',
  label: 'Solicitar acceso beta',
} as const;

const APP_URL = import.meta.env.PUBLIC_APP_URL ?? 'http://localhost:5173';

export const APP = {
  /** Web app URL, resuelto por ambiente en build (Astro estático). Prod/preview:
   * `PUBLIC_APP_URL` (seteada en el proyecto Vercel del landing =
   * `https://app.moneydiary.cl`); dev: fallback al server local (`pnpm web dev`).
   * De acá derivan "Ingresar" (`APP`) y "Probar" (`PROBAR`), así que en prod
   * ambos apuntan al web correcto. */
  url: APP_URL,
  /** Destino del CTA "Ingresar": la ruta `/login`, no la raíz de la app —
   * apuntar a la raíz permitía que una cookie de sesión demo residual saltara
   * directo al dashboard sin pasar por el formulario de login (bugfix). */
  loginHref: `${APP_URL}/login`,
  label: 'Ingresar',
} as const;

export const PROBAR = {
  /** demo-trial-mode (DEMO-UI-01): plain top-level navigation to
   * `GET /api/auth/demo` — the backend's Sec-Fetch guard requires a
   * top-level document navigation, so this MUST stay an `<a href>`, never a
   * button/fetch call. */
  url: `${APP.url}/api/auth/demo`,
  label: 'Probar',
} as const;

export interface FAQItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    q: '¿Qué es MoneyDiary y cómo funciona?',
    a: 'MoneyDiary es una aplicación que te ayuda a controlar tus finanzas personales usando la regla 50/30/20. Solo subes tu cartola bancaria en formato Excel y nosotros clasificamos automáticamente tus gastos en Necesidades, Deseos y Ahorro.',
  },
  {
    q: '¿Mis datos bancarios están seguros?',
    a: 'Sí. MoneyDiary no se conecta directamente a tu banco ni almacena credenciales. Solo procesas archivos que tú subes voluntariamente. Tus datos se cifran y puedes eliminarlos en cualquier momento.',
  },
  {
    q: '¿Qué bancos son compatibles?',
    a: 'Actualmente trabajamos con BancoEstado, Banco de Chile, BCI y Santander, que cubren a más del 90% de los usuarios en Chile. Si tu banco no está en la lista, escríbenos y lo agregaremos.',
  },
  {
    q: '¿La regla 50/30/20 se adapta a mi realidad?',
    a: 'Totalmente. La regla es solo un punto de partida. MoneyDiary te muestra cómo distribuyes tus gastos y te permite ajustar los porcentajes según tus metas y estilo de vida.',
  },
  {
    q: '¿MoneyDiary es gratis?',
    a: 'Estamos en fase beta y el acceso es completamente gratuito. Queremos validar el producto con usuarios reales antes de definir un modelo de suscripción. Al registrarte en la beta, tendrás acceso prioritario.',
  },
  {
    q: '¿Puedo usar MoneyDiary desde el celular?',
    a: 'Sí. MoneyDiary está optimizado para funcionar en cualquier navegador móvil. Además, estamos desarrollando una app nativa para iOS y Android que estará disponible próximamente.',
  },
];

export const PRIVACY = {
  url: '/privacidad',
  label: 'Política de privacidad',
} as const;
