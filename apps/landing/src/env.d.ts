/// <reference types="astro/client" />

interface ImportMetaEnv {
  /**
   * URL base del web app, por ambiente (build-time). Prod/preview:
   * `https://app.moneydiary.cl` (seteada en el proyecto Vercel del landing).
   * Sin setear (dev local) → fallback en `config.ts` al server local
   * (`http://localhost:5173`). Pública: sin secretos.
   */
  readonly PUBLIC_APP_URL?: string;
}
