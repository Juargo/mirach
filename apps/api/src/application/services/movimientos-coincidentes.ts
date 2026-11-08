import { Bucket } from '../../domain/value-objects/bucket';
import {
  MatchType,
  PatronClasificacion,
} from '../../domain/value-objects/patron-clasificacion';
import { buscarPatronPorTexto } from '../../domain/value-objects/patron-existente';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { CategorizarTransaccionUseCase } from '../use-cases/categorizar-transaccion.use-case';
import { MovimientoParaAprender } from '../ports/movimientos-para-aprender.port';

/**
 * Category id that marks the candidate inside the simulated catalog. Real
 * ids are cuids and never contain underscores, so it cannot collide.
 */
const CATEGORIA_CANDIDATA = '__candidato__';
const ID_CANDIDATO = '__patron-candidato__';
/** A new pattern is the newest of the catalog: it loses CLA-12 ties. */
const CREADO_EN_NUEVO = new Date(8.64e15);

/**
 * seleccionarMovimientosCoincidentes — the movements that "coincide" with a
 * candidate pattern (S2, CLA-15, CLA-03).
 *
 * A movement counts when the engine (`CategorizarTransaccionUseCase`, so
 * CLA-12 longest-then-oldest and CLA-14 folding come for free), run with the
 * candidate added to the person's catalog, picks the candidate. The
 * candidate is given a marker category, so "picks the candidate" is an exact
 * check and not "lands in the target category".
 *
 * If a pattern with the same folded text already exists (CLA-17), the
 * candidate REPLACES it: the evaluation is "that pattern, moved to the
 * target", keeping its id, match type and `creadoEn` (the CLA-12 tie-break).
 *
 * Excluded: incomes, rows with `clasificacionManual` (CLA-16), rows already
 * in the target category, and `excluirIds`. Pure; never throws.
 */
export function seleccionarMovimientosCoincidentes(input: {
  readonly categorizar: CategorizarTransaccionUseCase;
  readonly patrones: ReadonlyArray<PatronClasificacion>;
  readonly candidato: {
    readonly patron: string;
    readonly matchType: MatchType;
  };
  readonly categoriaDestinoId: string;
  readonly movimientos: ReadonlyArray<MovimientoParaAprender>;
  readonly excluirIds?: ReadonlyArray<string>;
}): MovimientoParaAprender[] {
  const existente = buscarPatronPorTexto(
    input.patrones,
    input.candidato.patron,
  );
  const candidato = new PatronClasificacion({
    id: existente?.id ?? ID_CANDIDATO,
    patron: existente?.patron ?? input.candidato.patron,
    matchType: existente?.matchType ?? input.candidato.matchType,
    categoria: { id: CATEGORIA_CANDIDATA, nombre: '', bucket: Bucket.Deseos },
    prioridad: existente?.prioridad ?? 100,
    creadoEn: existente?.creadoEn ?? CREADO_EN_NUEVO,
  });
  const catalogo = [
    ...input.patrones.filter((p) => p !== existente),
    candidato,
  ];
  const excluidos = new Set(input.excluirIds ?? []);

  return input.movimientos.filter((m) => {
    if (excluidos.has(m.id)) return false;
    if (Transaccion.esIngreso(m.cargo, m.abono)) return false;
    if (m.clasificacionManual) return false;
    if (m.categoriaIdActual === input.categoriaDestinoId) return false;

    const resultado = input.categorizar
      .execute(
        { descripcion: m.descripcion, cargo: m.cargo, abono: m.abono },
        catalogo,
        null,
      )
      .getValue();
    return (
      resultado.tipo === 'clasificada' &&
      resultado.categoria?.id === CATEGORIA_CANDIDATA
    );
  });
}
