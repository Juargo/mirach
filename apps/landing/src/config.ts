export const SITE = {
  title: 'Mirach',
  description:
    'Controla tus finanzas personales con la regla 50/30/20. Mirach, la app para iPhone, analiza tus gastos bancarios y te muestra exactamente a dónde va tu dinero.',
  url: 'https://mirachbudget.app',
  ogImage: '/og-image.png',
} as const;

export interface FAQItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    q: '¿Qué es Mirach y cómo funciona?',
    a: 'Mirach es una aplicación para iPhone que te ayuda a controlar tus finanzas personales usando la regla 50/30/20. Solo subes tu cartola bancaria en formato Excel o PDF y nosotros clasificamos automáticamente tus gastos en Necesidades, Deseos y Ahorro.',
  },
  {
    q: '¿Mis datos bancarios están seguros?',
    a: 'Sí. Mirach no se conecta directamente a tu banco ni almacena credenciales. Solo procesamos archivos que tú subes voluntariamente. Tus datos se cifran y puedes eliminarlos en cualquier momento.',
  },
  {
    q: '¿Qué bancos son compatibles?',
    a: 'Actualmente trabajamos con BancoEstado, Banco de Chile, BCI y Santander. Si tu banco no está en la lista, escríbenos y lo agregaremos.',
  },
  {
    q: '¿La regla 50/30/20 se adapta a mi realidad?',
    a: 'Totalmente. La regla es solo un punto de partida. Mirach te muestra cómo distribuyes tus gastos y te permite ajustar los porcentajes según tus metas y estilo de vida.',
  },
  {
    q: '¿Dónde puedo usar Mirach?',
    a: 'Mirach es una app nativa para iPhone (iOS 17 o superior) y estará disponible próximamente en el App Store. Inicias sesión con Sign in with Apple.',
  },
];

export const PRIVACY = {
  url: '/privacidad',
  label: 'Política de privacidad',
} as const;

export const SUPPORT = {
  url: '/soporte',
  label: 'Soporte',
} as const;

/** Public contact address for privacy and support requests. */
export const CONTACT = {
  email: 'jorgeretamalaburto@gmail.com',
} as const;
