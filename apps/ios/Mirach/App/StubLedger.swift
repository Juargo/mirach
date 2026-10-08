import Foundation

/// The September 2026 movements behind the UI-test stub (see `AppEnvironment.stubbedClientArgument`).
/// The Resumen totals and the bucket detail both come from here, so reclassifying a movement
/// changes both, like the real API.
final class StubLedger: @unchecked Sendable {
    private struct Entry {
        let id: String
        let day: Int
        let descripcion: String
        let origen: String
        let monto: Int
        /// The stub catalog id, or `nil` for «Sin categoría».
        var categoriaId: String?
        var bucket: Bucket
    }

    private let lock = NSLock()
    private var entries: [Entry] = [
        Entry(id: "t-n1", day: 1, descripcion: "LIDER EXPRESS PROVIDENCIA", origen: "Banco de Chile", monto: 245_300, categoriaId: "stub-nec-super", bucket: .necesidades),
        Entry(id: "t-n2", day: 4, descripcion: "JUMBO LAS CONDES", origen: "Banco de Chile", monto: 187_200, categoriaId: "stub-nec-super", bucket: .necesidades),
        Entry(id: "t-n3", day: 6, descripcion: "COPEC ESTACION 114", origen: "Banco de Chile", monto: 60_000, categoriaId: "stub-nec-transp", bucket: .necesidades),
        Entry(id: "t-n4", day: 7, descripcion: "METRO DE SANTIAGO", origen: "Banco de Chile", monto: 20_000, categoriaId: "stub-nec-transp", bucket: .necesidades),
        Entry(id: "t-n5", day: 9, descripcion: "TRANSF A JUAN PEREZ", origen: "Banco de Chile", monto: 400_000, categoriaId: nil, bucket: .necesidades),
        Entry(id: "t-d1", day: 2, descripcion: "RESTAURANT LA PUNTA", origen: "Banco de Chile", monto: 118_500, categoriaId: "stub-des-rest", bucket: .deseos),
        Entry(id: "t-d2", day: 5, descripcion: "PIZZERIA BELLA NAPOLI", origen: "Manual", monto: 92_400, categoriaId: "stub-des-rest", bucket: .deseos),
        Entry(id: "t-d3", day: 3, descripcion: "NETFLIX.COM", origen: "Banco de Chile", monto: 9_990, categoriaId: "stub-des-susc", bucket: .deseos),
        Entry(id: "t-d4", day: 8, descripcion: "SPOTIFY PREMIUM FAMILY", origen: "Banco de Chile", monto: 5_490, categoriaId: "stub-des-susc", bucket: .deseos),
        Entry(id: "t-d5", day: 10, descripcion: "COMPRA ONLINE MERCADO LIBRE CHILE", origen: "Banco de Chile", monto: 384_020, categoriaId: nil, bucket: .deseos),
        Entry(id: "t-a1", day: 11, descripcion: "TRANSFERENCIA A FONDO DE EMERGENCIA", origen: "Banco de Chile", monto: 120_000, categoriaId: "stub-aho-fondo", bucket: .ahorro),
    ]

    static let income = 1_850_000
    private static let monthStart = Date(timeIntervalSince1970: 1_788_220_800) // 2026-09-01 UTC

    func total(_ bucket: Bucket) -> Int {
        lock.withLock { entries.filter { $0.bucket == bucket }.reduce(0) { $0 + $1.monto } }
    }

    /// Movements of this month in a category (the stub's «all history»).
    func count(categoryId: String) -> Int {
        lock.withLock { entries.filter { $0.categoriaId == categoryId }.count }
    }

    /// The category changed bucket: its movements follow it, like the server derives the bucket.
    func rebucket(categoryId: String, to bucket: Bucket) {
        lock.withLock {
            for index in entries.indices where entries[index].categoriaId == categoryId { entries[index].bucket = bucket }
        }
    }

    /// The category was deleted: its movements go to another one (the bucket's «Desconocido»).
    func reassign(from categoryId: String, to category: CategoriaCatalogo) {
        lock.withLock {
            for index in entries.indices where entries[index].categoriaId == categoryId {
                entries[index].categoriaId = category.id
                entries[index].bucket = category.bucket
            }
        }
    }

    /// Moves a movement to a catalog category, like the server does (the bucket follows).
    func reclassify(id: String, to category: CategoriaCatalogo) -> Bool {
        lock.withLock {
            guard let index = entries.firstIndex(where: { $0.id == id }) else { return false }
            entries[index].categoriaId = category.id
            entries[index].bucket = category.bucket
            return true
        }
    }

    func detalle(bucket: Bucket, periodo: Periodo, categories: [CategoriaCatalogo]) -> BucketDetalle {
        let mine = lock.withLock { periodo.apiValue == "2026-09" ? entries.filter { $0.bucket == bucket } : [] }
        let byCategory = Dictionary(grouping: mine, by: \.categoriaId)
        var grupos = byCategory.map { id, items -> GrupoCategoria in
            let name = categories.first { $0.id == id }?.nombre ?? "Sin categoría"
            let moves = items.sorted { $0.monto > $1.monto }.map {
                MovimientoBucket(
                    id: $0.id, fecha: Self.monthStart.addingTimeInterval(Double($0.day) * 86_400),
                    descripcion: $0.descripcion, origen: $0.origen, monto: $0.monto
                )
            }
            return GrupoCategoria(
                categoriaId: id, nombre: name, icono: categories.first { $0.id == id }?.icono,
                subtotal: moves.reduce(0) { $0 + $1.monto }, conteo: moves.count, transacciones: moves
            )
        }
        // Like the API: biggest subtotal first, «Sin categoría» always last.
        grupos.sort { ($0.categoriaId == nil ? 1 : 0, -$0.subtotal) < ($1.categoriaId == nil ? 1 : 0, -$1.subtotal) }
        let total = grupos.reduce(0) { $0 + $1.subtotal }
        let metas: [Bucket: Int] = [.necesidades: 5000, .deseos: 3000, .ahorro: 2000]
        return BucketDetalle(
            bucket: bucket, periodo: periodo, total: total,
            porcentajeBp: total == 0 ? nil : total * 10_000 / Self.income, metaBp: metas[bucket],
            totalTransacciones: mine.count, totalCategorias: grupos.count, grupos: grupos
        )
    }
}

extension StubMirachAPI {
    func bucketDetalle(bucket: Bucket, periodo: Periodo) async throws -> BucketDetalle {
        ledger.detalle(bucket: bucket, periodo: periodo, categories: try await categorias().categorias)
    }

    /// An id outside the catalog is refused like the server does (400); an unknown movement is a 404.
    func reclasificar(transaccionId: String, categoriaId: String) async throws -> Reclasificacion {
        guard let category = try await categorias().categoria(id: categoriaId) else {
            throw ReclasificarError.categoryNotFound
        }
        guard ledger.reclassify(id: transaccionId, to: category) else { throw ReclasificarError.movementNotFound }
        return Reclasificacion(categoriaId: category.id, categoriaNombre: category.nombre, bucket: category.bucket)
    }
}

/// The stub's incomes: September and August have some (they add up to the Resumen's income),
/// July none. Oldest first, like the API.
extension StubLedger {
    private static let incomes: [String: [(id: String, day: Int, descripcion: String, origen: String, monto: Int)]] = [
        "2026-09": [
            ("i-s1", 1, "ABONO SUELDO EMPRESA SERVICIOS TECNOLOGICOS Y CONSULTORIA LIMITADA", "Banco de Chile", 1_650_000),
            ("i-s2", 5, "TRANSFERENCIA DE MARIA GONZALEZ", "Banco de Chile", 100_000),
            ("i-s3", 8, "DEVOLUCION IMPUESTOS SII", "Manual", 60_000),
            ("i-s4", 12, "VENTA MARKETPLACE", "BancoEstado", 40_000),
        ],
        "2026-08": [
            ("i-a1", 2, "ABONO SUELDO", "Banco de Chile", 1_700_000),
            ("i-a2", 20, "REEMBOLSO GASTOS COMUNES", "Manual", 150_000),
        ],
    ]

    func ingresos(periodo: Periodo) -> IngresosMes {
        let items = (Self.incomes[periodo.apiValue] ?? []).map {
            Ingreso(
                id: $0.id, fecha: Self.monthStart(of: periodo).addingTimeInterval(Double($0.day - 1) * 86_400),
                descripcion: $0.descripcion, origen: $0.origen, monto: $0.monto
            )
        }
        return IngresosMes(
            periodo: periodo, total: items.reduce(0) { $0 + $1.monto }, conteo: items.count, transacciones: items
        )
    }

    private static func monthStart(of periodo: Periodo) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: periodo.year, month: periodo.month, day: 1))!
    }
}

extension StubMirachAPI {
    func ingresosMes(periodo: Periodo) async throws -> IngresosMes { ledger.ingresos(periodo: periodo) }
}
