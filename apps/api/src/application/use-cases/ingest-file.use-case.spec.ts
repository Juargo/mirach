import { IngestFileUseCase, InvalidFileExtensionError } from './ingest-file.use-case';
import { IFileReader } from '../ports/file-reader.port';

/** Fake (doble de prueba) de IFileReader — no depende de Multer ni HTTP. */
function makeFileReader(overrides: Partial<{
  buffer: Buffer;
  originalName: string;
  sizeInBytes: number;
}> = {}): IFileReader {
  return {
    getBuffer: () => overrides.buffer ?? Buffer.from('fake-content'),
    getOriginalName: () => overrides.originalName ?? 'archivo.xlsx',
    getSizeInBytes: () => overrides.sizeInBytes ?? 1024,
  };
}

describe('IngestFileUseCase', () => {
  let useCase: IngestFileUseCase;

  beforeEach(() => {
    useCase = new IngestFileUseCase();
  });

  describe('cuando el archivo es válido', () => {
    it('retorna Ok con metadata correcta para .xlsx', () => {
      const reader = makeFileReader({ originalName: 'cartola.xlsx', sizeInBytes: 2048 });

      const result = useCase.execute(reader);

      expect(result.isOk()).toBe(true);
      const data = result.getValue();
      expect(data.originalName).toBe('cartola.xlsx');
      expect(data.extension).toBe('.xlsx');
      expect(data.sizeInBytes).toBe(2048);
    });

    it('retorna Ok para extensión .xlsx en mayúsculas', () => {
      const reader = makeFileReader({ originalName: 'Cartola_BCI.XLSX' });

      const result = useCase.execute(reader);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().extension).toBe('.xlsx');
    });

    // Sprint 4 (sprint4-pdf-ingesta, PDF-00): .pdf se acepta a la par de
    // .xlsx en el gate de extensión — el pipeline PDF completo (detectar/
    // validar/normalizar) se agrega en slices posteriores, pero la extensión
    // ya no lo bloquea aquí.
    it('retorna Ok con metadata correcta para .pdf', () => {
      const reader = makeFileReader({ originalName: 'cartola.pdf', sizeInBytes: 4096 });

      const result = useCase.execute(reader);

      expect(result.isOk()).toBe(true);
      const data = result.getValue();
      expect(data.originalName).toBe('cartola.pdf');
      expect(data.extension).toBe('.pdf');
      expect(data.sizeInBytes).toBe(4096);
    });

    it('incluye el buffer en el resultado', () => {
      const buffer = Buffer.from('binary-content');
      const reader = makeFileReader({ buffer });

      const result = useCase.execute(reader);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().buffer).toBe(buffer);
    });
  });

  describe('cuando el archivo no es válido', () => {
    // ADR-007: .xls ya no está soportado — usar .xlsx desde el portal del banco
    it('retorna Fail para extensión .xls (formato legacy eliminado — ADR-007)', () => {
      const reader = makeFileReader({ originalName: 'cartola.xls' });

      const result = useCase.execute(reader);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidFileExtensionError);
    });

    it('retorna Fail para extensión .csv', () => {
      const reader = makeFileReader({ originalName: 'movimientos.csv' });

      const result = useCase.execute(reader);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidFileExtensionError);
      expect(result.getError().message).toContain('.csv');
    });

    it('retorna Fail para archivo sin extensión', () => {
      const reader = makeFileReader({ originalName: 'archivo-sin-extension' });

      const result = useCase.execute(reader);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidFileExtensionError);
    });

    it('el mensaje de error menciona la extensión permitida', () => {
      const reader = makeFileReader({ originalName: 'datos.txt' });

      const result = useCase.execute(reader);

      expect(result.isFail()).toBe(true);
      const message = result.getError().message;
      expect(message).toContain('.xlsx');
    });
  });
});
