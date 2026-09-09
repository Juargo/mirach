/**
 * Generador del fixture `protegida-test.pdf` — PDF mínimo de una página,
 * cifrado con el standard security handler de PDF más antiguo y simple:
 * **V=1/R=2 (RC4-40, 40-bit)**, por decisión de diseño D-11
 * (`openspec/changes/ingesta-pdf-password/design.md`).
 *
 * No hace falta estructura real de cartola bancaria — Slice 1 solo ejercita
 * `PdfTextExtractor`, no la detección de banco. El contenido es un único
 * texto de marcador ("PDF PROTEGIDO FIXTURE").
 *
 * ⚠️ RC4-40 es criptográficamente débil, público y trivialmente
 * quebrable — eso es DESEABLE aquí, no un descuido: es el fixture más
 * simple que pdfjs-dist soporta para probar la detección de
 * `PasswordException`, y NO protege ningún dato real (todo el contenido es
 * un marcador ficticio). Una futura revisión de seguridad NO debe
 * "arreglar" este archivo migrándolo a un cifrado más fuerte — el punto es
 * la simplicidad reproducible, no la resistencia criptográfica.
 *
 * `PASSWORD_FIXTURE` es un literal obviamente falso, marcado
 * `gitleaks:allow` siguiendo el precedente de
 * `test/vinculacion-google.int-spec.ts`.
 *
 * Implementación de MD5/RC4: MD5 vía `node:crypto` (`createHash('md5')`,
 * disponible sin gate de proveedor legacy); RC4 hand-rolled en ~20 líneas
 * de JS puro — el cifrador `rc4` de OpenSSL 3 fue movido al proveedor
 * "legacy" y Node no lo expone por defecto, así que `crypto.createCipheriv
 * ('rc4', ...)` no es una opción portable. No se agrega ninguna dependencia
 * nueva (ADR-021 SCA gate + cuarentena de 7 días en `.npmrc`).
 *
 * El algoritmo completo (Algorithm 2/3/4 de la especificación PDF 1.7,
 * §7.6.3) fue verificado línea a línea contra la implementación real de
 * `pdfjs-dist@6.2.108` (`CipherTransformFactory` en
 * `legacy/build/pdf.worker.mjs`) antes de escribir este generador, para
 * evitar un desajuste de un solo byte que solo se manifestaría como un
 * `PasswordException` inesperado en tiempo de test.
 *
 * Regenerar (desde apps/api):
 *   pnpm exec tsx test/fixtures/pdf/generar-protegida-test.ts
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Password correcta del fixture — deliberadamente falsa, no es un secreto real. */
export const PASSWORD_FIXTURE = 'clave-fixture-pdf-protegido-2026'; // gitleaks:allow — fixture de test, no es un secreto

/** Padding estándar de 32 bytes de la especificación PDF (§7.6.3.3, Algorithm 2). */
const PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/**
 * Valor de permisos /P: bits 3-6 (print/modify/copy/annotate) en 1, bits
 * 1-2 y 7-8 (reservados) en 0, bits 9-32 (reservados, revisión 2) en 1 —
 * ver PDF 1.7 §7.6.3.2 Table 22. Como entero de 32 bits con signo:
 * 0xFFFFFF3C = -196.
 */
const PERMISOS_P = -196;

/** ID de archivo fijo (determinista) — solo se usa como sal en la derivación de la clave. */
const FILE_ID = Buffer.from('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'hex');

/** Longitud de clave RC4-40 en bytes (40 bits). */
const KEY_LENGTH_BYTES = 5;

function md5(data: Buffer): Buffer {
  return createHash('md5').update(data).digest();
}

/** RC4 (Algorithm KSA + PRGA) — pdf.js llama a este mismo algoritmo `ARCFourCipher`. */
function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

/** Padea/trunca una password a exactamente 32 bytes (PDF 1.7 §7.6.3.3, paso a). */
function pad(password: string): Buffer {
  const bytes = Buffer.from(password, 'latin1').subarray(0, 32);
  if (bytes.length === 32) return bytes;
  return Buffer.concat([bytes, PAD.subarray(0, 32 - bytes.length)]);
}

/** Algorithm 3 (Computing the O value) — revisión 2, sin las 19 rondas extra de R3+. */
function computeO(ownerPassword: string, userPassword: string): Buffer {
  const paddedOwner = pad(ownerPassword);
  const digest = md5(paddedOwner);
  const rc4Key = digest.subarray(0, KEY_LENGTH_BYTES);
  const paddedUser = pad(userPassword);
  return rc4(rc4Key, paddedUser);
}

/** Algorithm 2 (Computing an encryption key) — revisión 2, sin el rehash de 50 rondas de R3+. */
function computeFileKey(
  userPassword: string,
  oBytes: Buffer,
  permissions: number,
  fileId: Buffer,
): Buffer {
  const paddedUser = pad(userPassword);
  const pBuf = Buffer.alloc(4);
  pBuf.writeInt32LE(permissions, 0);
  const hash = md5(Buffer.concat([paddedUser, oBytes, pBuf, fileId]));
  return hash.subarray(0, KEY_LENGTH_BYTES);
}

/** Algorithm 4 (Computing the U value, revisión 2). */
function computeU(fileKey: Buffer): Buffer {
  return rc4(fileKey, PAD);
}

/** Algorithm 1 (Computing an object key) para RC4 (no-AES). */
function computeObjectKey(
  fileKey: Buffer,
  objNum: number,
  genNum: number,
): Buffer {
  const extra = Buffer.from([
    objNum & 0xff,
    (objNum >> 8) & 0xff,
    (objNum >> 16) & 0xff,
    genNum & 0xff,
    (genNum >> 8) & 0xff,
  ]);
  const hash = md5(Buffer.concat([fileKey, extra]));
  const n = Math.min(fileKey.length + 5, 16);
  return hash.subarray(0, n);
}

function toHex(buffer: Buffer): string {
  return buffer.toString('hex').toUpperCase();
}

function generar(): Buffer {
  const oBytes = computeO(PASSWORD_FIXTURE, PASSWORD_FIXTURE);
  const fileKey = computeFileKey(PASSWORD_FIXTURE, oBytes, PERMISOS_P, FILE_ID);
  const uBytes = computeU(fileKey);

  // Objeto 4 (Contents) es el único con datos de texto — se cifra con RC4
  // usando la clave derivada del objeto (Algorithm 1). El resto de los
  // objetos (Catalog/Pages/Page/Font/Encrypt) no tienen strings, solo
  // nombres/números/referencias — nada más que cifrar en este PDF.
  const contenidoPlano = Buffer.from(
    'BT /F1 24 Tf 72 700 Td (PDF PROTEGIDO FIXTURE) Tj ET',
    'latin1',
  );
  const objectKeyContents = computeObjectKey(fileKey, 4, 0);
  const contenidoCifrado = rc4(objectKeyContents, contenidoPlano);

  const objetos: string[] = [];
  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objetos.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objetos.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
  );
  objetos.push(
    `4 0 obj\n<< /Length ${contenidoCifrado.length} >>\nstream\n${contenidoCifrado.toString('latin1')}\nendstream\nendobj\n`,
  );
  objetos.push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  );
  // Objeto 6 (Encrypt): sus propias strings (O/U) NUNCA se cifran (PDF 1.7
  // §7.6.2) — se escriben como hex strings crudas.
  objetos.push(
    `6 0 obj\n<< /Filter /Standard /V 1 /R 2 /O <${toHex(oBytes)}> /U <${toHex(uBytes)}> /P ${PERMISOS_P} >>\nendobj\n`,
  );

  let cuerpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const objeto of objetos) {
    offsets.push(Buffer.byteLength(cuerpo, 'latin1'));
    cuerpo += objeto;
  }
  const inicioXref = Buffer.byteLength(cuerpo, 'latin1');
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  const trailer =
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Encrypt 6 0 R ` +
    `/ID [<${toHex(FILE_ID)}> <${toHex(FILE_ID)}>] >>\n` +
    `startxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(cuerpo + xref + trailer, 'latin1');
}

const destino = join(__dirname, 'protegida-test.pdf');
writeFileSync(destino, generar());

console.log(`fixture generado: ${destino}`);
