/**
 * RateLimitConfig — umbrales y ventana del rate limiter de login (AUTH-08).
 *
 * ADR-029: antes se poblaba vía `readRateLimitConfigFromEnv()` (leía
 * `process.env` acá mismo, con validación fail-closed ad-hoc). Esa función se
 * eliminó — `env.ts` ya valida `LOGIN_RATELIMIT_*` con Zod
 * (`.coerce.number().int().positive()`, ver env.spec.ts), y `crearAuth(prisma,
 * env)` construye este objeto directamente desde `env.LOGIN_RATELIMIT_*`
 * (DRY: una sola validación, no dos).
 */
export interface RateLimitConfig {
  readonly maxAttemptsPerEmail: number;
  readonly maxAttemptsPerIp: number;
  readonly windowMs: number;
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
