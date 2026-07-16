import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Result } from '../../shared/result';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';

/** Un token de texto posicionado, con la página (1-indexed) donde apareció. */
export interface PagedToken {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly page: number;
}

/** Todos los tokens de texto del PDF, concatenados en orden de página. */
export type PagedTokens = ReadonlyArray<PagedToken>;

/**
 * PdfTextExtractor — único punto de contacto con pdfjs-dist (infrastructure/pdf).
 *
 * Carga el PDF UNA vez (hardened: sin eval, sin fuentes de red/sistema, sin
 * worker thread — Node.js corre pdfjs en el hilo principal por defecto) y
 * devuelve los tokens de texto crudos con su posición X/Y y página. Los 3
 * ports de PDF (detector/validador/normalizador) consumen este extractor —
 * SRP: la interoperabilidad con pdfjs vive en un solo archivo (ver design.md
 * decisión #2).
 *
 * NUNCA lanza — errores de carga se traducen a Result.fail.
 */
export class PdfTextExtractor {
  async extract(
    buffer: Buffer,
    nombreArchivo: string,
  ): Promise<Result<PagedTokens, PdfInvalidoError | PdfSinTextoError>> {
    let documento: PDFDocumentProxy | undefined;
    try {
      // Import dinámico: pdfjs-dist 6.x solo publica build ESM
      // (`build/pdf.mjs`, sin "exports" en package.json). Este paquete
      // (apps/api) es CommonJS (sin "type":"module"); un `import` estático
      // se transpilaría a `require()` y fallaría en runtime para un
      // paquete ESM-only. `import()` dinámico sí puede cargar ESM desde
      // CJS — es el único punto de fricción de interop, confinado aquí
      // (design.md: "validar el import path PRIMERO — gatea todo
      // adapter"). Vive DENTRO del try: si el módulo no resuelve (build
      // roto, paquete faltante, etc), el contrato de la clase ("NUNCA
      // lanza") sigue cumpliéndose — se traduce a Result.fail igual que
      // cualquier otro fallo de carga.
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      documento = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        // `isEvalSupported: false` (design.md, propuesta original) YA NO
        // EXISTE en pdfjs-dist@6.x — existía hasta la v4 para desactivar un
        // codepath interno con `new Function()` (evaluación de funciones
        // PostScript). La opción se eliminó junto con ese codepath en
        // versiones más nuevas, así que no hay nada que endurecer aquí:
        // confirmado leyendo el .d.ts del paquete instalado, no se agrega
        // de vuelta con un `as any` (rompería en cuanto el tipo lo prohíbe).
        disableFontFace: true,
        useSystemFonts: false,
      }).promise;
    } catch {
      // Cualquier fallo de carga (estructura corrupta, buffer no-PDF, etc)
      // se traduce a un error de dominio controlado — nunca cuelga ni
      // propaga la excepción cruda de pdfjs.
      return Result.fail(new PdfInvalidoError(nombreArchivo));
    }

    const tokens: PagedToken[] = [];
    try {
      for (
        let numeroPagina = 1;
        numeroPagina <= documento.numPages;
        numeroPagina++
      ) {
        const pagina = await documento.getPage(numeroPagina);
        const contenido = await pagina.getTextContent();
        for (const item of contenido.items) {
          if (!('str' in item)) continue; // TextMarkedContent no trae str/transform
          // pdfjs tipa `transform` como `Array<any>` (matriz de transformación
          // [scaleX, skewX, skewY, scaleY, translateX, translateY]) — Number()
          // fuerza el tipo numérico explícito en el borde de interop con la
          // librería, en vez de propagar `any` al resto del pipeline.
          tokens.push({
            str: item.str,
            x: Number(item.transform[4]),
            y: Number(item.transform[5]),
            page: numeroPagina,
          });
        }
      }
    } catch {
      return Result.fail(new PdfInvalidoError(nombreArchivo));
    }

    if (tokens.length === 0) {
      return Result.fail(new PdfSinTextoError(nombreArchivo));
    }

    return Result.ok(tokens);
  }
}
