/** Defaults de DemoRateLimiter — 3 intentos por IP por hora (DEMO-AUTH-02). */
export const DEFAULT_MAX_ATTEMPTS_PER_IP = 3;
export const DEFAULT_WINDOW_MS = 3_600_000;

/**
 * Cota dura del `Map` en memoria — mismo razonamiento que `LoginRateLimiter`
 * (login-rate-limiter.ts): sin ella, tráfico (u orgánico o de un atacante
 * rotando IPs) haría crecer el mapa sin límite (memory-exhaustion DoS).
 */
export const DEFAULT_MAX_ENTRIES = 10_000;

interface Contador {
  conteo: number;
  expiraEn: number;
}

/**
 * DemoRateLimiter — limitador de creación de cuentas demo, en memoria, SOLO
 * por IP (DEMO-AUTH-02). A diferencia de `LoginRateLimiter` no tiene
 * dimensión por email (el demo es anónimo, no hay email) y no necesita
 * lectura de config desde env — 3/hora es un valor fijo de producto, no un
 * umbral de seguridad que un operador deba poder retocar (YAGNI).
 *
 * Mismo patrón de storage que `LoginRateLimiter`: `Map` en proceso, ventana
 * fija, evicción perezosa + purga en cada inserción para no crecer sin
 * límite. El prefijo `demo:ip:` evita colisión con las claves de
 * `LoginRateLimiter` en caso de que algún día compartan almacenamiento.
 */
export class DemoRateLimiter {
  private readonly contadores = new Map<string, Contador>();

  constructor(
    private readonly maxAttemptsPerIp: number = DEFAULT_MAX_ATTEMPTS_PER_IP,
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
    private readonly ahora: () => number = Date.now,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  isBlocked(ip: string): boolean {
    const vigente = this.readCurrent(this.ipKey(ip));
    return vigente !== undefined && vigente.conteo >= this.maxAttemptsPerIp;
  }

  recordFailure(ip: string): void {
    this.incrementar(this.ipKey(ip));
  }

  reset(ip: string): void {
    this.contadores.delete(this.ipKey(ip));
  }

  private incrementar(key: string): void {
    const vigente = this.readCurrent(key);

    if (vigente === undefined) {
      this.purgarExpiradas();
      this.evictarSiExcedeCapacidad();
      this.contadores.set(key, { conteo: 1, expiraEn: this.ahora() + this.windowMs });
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

  private ipKey(ip: string): string {
    return `demo:ip:${ip}`;
  }
}
