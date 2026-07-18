/** RateLimitConfig — umbrales y ventana del rate limiter de login (AUTH-08). */
export interface RateLimitConfig {
  readonly maxPorEmail: number;
  readonly maxPorIp: number;
  readonly ventanaMs: number;
}

/** Lee los defaults desde env (mirrors ApiKeyGuard's env-driven config). */
export function leerRateLimitConfigDesdeEnv(): RateLimitConfig {
  return {
    maxPorEmail: Number(process.env.LOGIN_RATELIMIT_MAX_EMAIL ?? 5),
    maxPorIp: Number(process.env.LOGIN_RATELIMIT_MAX_IP ?? 20),
    ventanaMs: Number(process.env.LOGIN_RATELIMIT_WINDOW_MS ?? 900_000),
  };
}

interface Contador {
  conteo: number;
  expiraEn: number;
}

/**
 * LoginRateLimiter — limitador de intentos de login en memoria, por IP y por
 * email (AUTH-08). Cuenta SOLO fallos — el controller llama `registrarFallo`
 * cuando `LoginUseCase` falla, y `resetear` cuando tiene éxito. Un login
 * correcto nunca es throttled por este mecanismo.
 *
 * Storage: `Map` en proceso, ventana fija (no deslizante) — correcto para una
 * sola instancia Render (KISS/YAGNI, ver design.md §1). Evicción perezosa: en
 * cada acceso, las entradas vencidas se tratan como ausentes.
 */
export class LoginRateLimiter {
  private readonly contadores = new Map<string, Contador>();

  constructor(
    private readonly config: RateLimitConfig,
    private readonly ahora: () => number = Date.now,
  ) {}

  estaBloqueado(ip: string, email: string): boolean {
    const porEmail = this.leerVigente(this.claveEmail(email));
    const porIp = this.leerVigente(this.claveIp(ip));

    return (
      (porEmail !== undefined && porEmail.conteo >= this.config.maxPorEmail) ||
      (porIp !== undefined && porIp.conteo >= this.config.maxPorIp)
    );
  }

  registrarFallo(ip: string, email: string): void {
    this.incrementar(this.claveEmail(email));
    this.incrementar(this.claveIp(ip));
  }

  resetear(ip: string, email: string): void {
    this.contadores.delete(this.claveEmail(email));
    this.contadores.delete(this.claveIp(ip));
  }

  private incrementar(key: string): void {
    const vigente = this.leerVigente(key);

    if (vigente === undefined) {
      this.contadores.set(key, { conteo: 1, expiraEn: this.ahora() + this.config.ventanaMs });
      return;
    }

    vigente.conteo += 1;
  }

  /** Lee la entrada solo si sigue vigente; una entrada vencida se trata como ausente. */
  private leerVigente(key: string): Contador | undefined {
    const entrada = this.contadores.get(key);
    if (entrada === undefined) return undefined;

    if (entrada.expiraEn <= this.ahora()) {
      this.contadores.delete(key);
      return undefined;
    }

    return entrada;
  }

  private claveEmail(email: string): string {
    return `email:${email.trim().toLowerCase()}`;
  }

  private claveIp(ip: string): string {
    return `ip:${ip}`;
  }
}
