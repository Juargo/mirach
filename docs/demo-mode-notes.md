# MoneyDiary Demo Mode — riesgos aceptados / diferidos

> Contexto: change SDD `demo-trial-mode`, backend (`GET /api/auth/demo`).
> Postura de seguridad elegida: **"hardening sin romper el link"** — el
> endpoint sigue siendo un `GET` alcanzable por navegación top-level (el
> landing lo abre en pestaña nueva); no se migra a `POST`. El hardening pasa
> por el guard `Sec-Fetch-*`, no por el verbo HTTP.

Este archivo registra, tras la revisión adversarial 4R de PR1 (backend), los
riesgos que quedan **explícitamente aceptados o diferidos** para el MVP —
igual estilo que la nota "Deuda abierta 11.6" de
`docs/mobile-launch-runbook.md`.

## Riesgos aceptados

- **Sin cap global / CAPTCHA en la creación de demos.** El único control es
  el rate limiter por IP (3/hora, `DemoRateLimiter`). Un atacante con
  rotación de IPs (proxies, botnet residencial) puede seguir generando
  cuentas demo sin límite agregado — riesgo residual de agotamiento de
  storage/costo. Mitigación futura: cap global diario + CAPTCHA/PoW si el
  abuso se materializa; no se implementa ahora (YAGNI hasta tener señal real
  de abuso).
- **El guard anti-embed (`Sec-Fetch-Dest`/`Sec-Fetch-Mode`) falla ABIERTO
  cuando ambos headers están ausentes.** Los navegadores modernos (Fetch
  Metadata, soportado ampliamente) siempre los envían; clientes legacy o
  ciertos proxies/CLIs no lo hacen. Ese tráfico legacy pasa el guard sin
  verificación — gap residual documentado, aceptado para no romper acceso
  legítimo de clientes que no pueden enviar el header.

## Trabajo diferido (no implementado en este PR)

- **Suite de integración/e2e de `design.md`** (creación de demo contra DB
  real, rate limit a nivel HTTP, reutilización de sesión) — requiere
  `ALLOW_DESTRUCTIVE_DB=1` + la migración aplicada; queda gateada igual que
  la suite e2e de auth (`test:e2e` / `test:integration`), no corre en el
  pipeline por defecto.
- **Migración `20260718120000_add_demo_trial_mode`** está escrita pero
  **NO aplicada** a la Supabase real — gate de deploy pendiente antes de
  habilitar el endpoint en producción.

## Explícitamente fuera de alcance de este PR (deuda no bloqueante)

- Extracción DRY del rate limiter (`LoginRateLimiter`/`DemoRateLimiter`
  comparten estructura).
- Refactor `AuthController` → un `IniciarDemoUseCase` que absorba la
  orquestación completa del endpoint.
- Cambios cosméticos de naming/TTL.
