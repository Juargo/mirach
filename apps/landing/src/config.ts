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

export const APP = {
  /** Web app URL — local dev server (`pnpm web dev`); replace with the Vercel URL when deployed */
  url: 'http://localhost:5173',
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

// !!! PLACEHOLDER — Replace with verified metrics before public launch !!!
export const SOCIAL_PROOF = {
  users: '+11.000',
  rating: '4.7',
  reviews: '—',
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

export const NEWSLETTER = {
  /** ConvertKit/Mailchimp form action URL — replace with real URL before deploy */
  action: '',
  placeholder: 'tu@email.com',
  buttonLabel: 'Suscribirme',
  privacyNotice:
    'Solo te escribiremos sobre novedades de MoneyDiary. Sin spam, prometido.',
} as const;

export const PRIVACY = {
  /** Privacy policy URL — replace when Track C delivers the real URL */
  url: '#',
  label: 'Política de privacidad',
} as const;
