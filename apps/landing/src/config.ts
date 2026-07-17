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
