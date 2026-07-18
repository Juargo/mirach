/** RateLimitConfig — umbrales y ventana del rate limiter de login (AUTH-08). */
export interface RateLimitConfig {
  readonly maxAttemptsPerEmail: number;
  readonly maxAttemptsPerIp: number;
  readonly windowMs: number;
}

/**
 * Lee los defaults desde env (mirrors ApiKeyGuard's env-driven config).
 *
 * Fail-closed (mirrors ApiKeyGuard): `Number(process.env.X ?? default)` deja
 * pasar en silencio dos casos peligrosos que `??` no atrapa porque `""` NO es
 * `null`/`undefined` — `Number("")` da `0` (auto-bloqueo/DoS: cualquier
 * fallo bloquea inmediatamente) y `Number("abc")` da `NaN` (el limiter queda
 * desactivado sin que nadie lo note, ya que toda comparación con `NaN` es
 * `false`). Cada valor se valida como finito y estrictamente positivo; si
 * alguno no lo es, se lanza en el arranque en vez de operar mal configurado.
 */
export function readRateLimitConfigFromEnv(): RateLimitConfig {
  const config = {
    maxAttemptsPerEmail: Number(process.env.LOGIN_RATELIMIT_MAX_EMAIL ?? 5),
    maxAttemptsPerIp: Number(process.env.LOGIN_RATELIMIT_MAX_IP ?? 20),
    windowMs: Number(process.env.LOGIN_RATELIMIT_WINDOW_MS ?? 900_000),
  };

  for (const [nombre, valor] of Object.entries(config)) {
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error(
        `Configuración de rate-limit de login inválida: "${nombre}" debe ser un número finito > 0 (recibido: ${valor}).`,
      );
    }
  }

  return config;
}

interface Contador {
  conteo: number;
  expiraEn: number;
}

/**
 * Cota dura del `Map` en memoria — sin ella, un atacante que rote emails/IPs
 * indefinidamente (o simplemente tráfico orgánico a escala) haría crecer el
 * mapa sin límite (memory-exhaustion DoS). 10k entradas es generoso para una
 * sola instancia Render mono-usuario/pocos-usuarios (design.md §1).
 */
export const MAX_ENTRIES = 10_000;

/**
 * LoginRateLimiter — limitador de intentos de login en memoria, por IP y por
 * email (AUTH-08). Cuenta SOLO fallos — el controller llama `recordFailure`
 * cuando `LoginUseCase` falla, y `reset` cuando tiene éxito. Un login
 * correcto nunca es throttled por este mecanismo.
 *
 * Storage: `Map` en proceso, ventana fija (no deslizante) — correcto para una
 * sola instancia Render (KISS/YAGNI, ver design.md §1). Evicción perezosa: en
 * cada acceso, las entradas vencidas se tratan como ausentes. Además, antes de
 * insertar una clave nueva se purgan todas las entradas vencidas y, si el
 * mapa sigue en (o sobre) `maxEntries`, se evictan las entradas más antiguas
 * (orden de inserción de `Map`) hasta volver a estar bajo la cota — el mapa
 * nunca crece sin límite (memory-exhaustion DoS).
 */
export class LoginRateLimiter {
  private readonly contadores = new Map<string, Contador>();

  constructor(
    private readonly config: RateLimitConfig,
    private readonly ahora: () => number = Date.now,
    private readonly maxEntries: number = MAX_ENTRIES,
  ) {}

  isBlocked(ip: string, email: string): boolean {
    const porEmail = this.readCurrent(this.emailKey(email));
    const porIp = this.readCurrent(this.ipKey(ip));

    return (
      (porEmail !== undefined && porEmail.conteo >= this.config.maxAttemptsPerEmail) ||
      (porIp !== undefined && porIp.conteo >= this.config.maxAttemptsPerIp)
    );
  }

  recordFailure(ip: string, email: string): void {
    this.incrementar(this.emailKey(email));
    this.incrementar(this.ipKey(ip));
  }

  reset(ip: string, email: string): void {
    this.contadores.delete(this.emailKey(email));
    this.contadores.delete(this.ipKey(ip));
  }

  private incrementar(key: string): void {
    const vigente = this.readCurrent(key);

    if (vigente === undefined) {
      this.purgarExpiradas();
      this.evictarSiExcedeCapacidad();
      this.contadores.set(key, { conteo: 1, expiraEn: this.ahora() + this.config.windowMs });
      return;
    }

    vigente.conteo += 1;
  }

  /** Barrido completo: elimina toda entrada cuya ventana ya venció. */
  private purgarExpiradas(): void {
    const ahora = this.ahora();
    for (const [key, entrada] of this.contadores) {
      if (entrada.expiraEn <= ahora) {
        this.contadores.delete(key);
      }
    }
  }

  /** Evicta las entradas más antiguas (orden de inserción) hasta volver a estar bajo `maxEntries`. */
  private evictarSiExcedeCapacidad(): void {
    while (this.contadores.size >= this.maxEntries) {
      const masAntigua = this.contadores.keys().next();
      if (masAntigua.done) break;
      this.contadores.delete(masAntigua.value);
    }
  }

  /** Lee la entrada solo si sigue vigente; una entrada vencida se trata como ausente. */
  private readCurrent(key: string): Contador | undefined {
    const entrada = this.contadores.get(key);
    if (entrada === undefined) return undefined;

    if (entrada.expiraEn <= this.ahora()) {
      this.contadores.delete(key);
      return undefined;
    }

    return entrada;
  }

  private emailKey(email: string): string {
    return `email:${email.trim().toLowerCase()}`;
  }

  private ipKey(ip: string): string {
    return `ip:${ip}`;
  }
}
