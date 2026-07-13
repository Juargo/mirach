/// <reference types="vitest/globals" />

// Nota: este archivo NO se llama `vitest.d.ts` a propósito. Con `baseUrl: "./"`
// en tsconfig, un archivo `vitest.d.ts` capturaría el specifier bare `vitest`
// (`import { Mock } from 'vitest'`) y rompería la resolución al paquete real.
