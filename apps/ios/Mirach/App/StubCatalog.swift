import Foundation

/// The stub's mutable catalog: Categorías and Detalle de categoría write to it, the review and
/// the bucket detail read it, so a change shows everywhere like it does against the server.
final class StubCatalog: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [CategoriaCatalogo]
    private var nextID = 1
    private var nextPatternID = 1

    /// Two real categories per bucket plus the internal «Desconocido».
    static let seed: [CategoriaCatalogo] = [
        CategoriaCatalogo(id: "stub-nec-desc", nombre: "Desconocido", bucket: .necesidades, icono: "circle-help", esInterna: true),
        CategoriaCatalogo(
            id: "stub-nec-super", nombre: "Supermercado", bucket: .necesidades, icono: "shopping-cart",
            patrones: [
                PatronCategoria(id: "stub-p-lider", patron: "LIDER", matchType: .contains),
                PatronCategoria(id: "stub-p-jumbo", patron: "JUMBO", matchType: .startsWith),
            ]
        ),
        CategoriaCatalogo(id: "stub-nec-transp", nombre: "Transporte", bucket: .necesidades, icono: "bus"),
        CategoriaCatalogo(id: "stub-des-desc", nombre: "Desconocido", bucket: .deseos, icono: "circle-help", esInterna: true),
        CategoriaCatalogo(id: "stub-des-rest", nombre: "Restaurantes", bucket: .deseos, icono: "utensils"),
        CategoriaCatalogo(
            id: "stub-des-susc", nombre: "Suscripciones", bucket: .deseos, icono: "tv",
            patrones: [PatronCategoria(id: "stub-p-netflix", patron: "NETFLIX", matchType: .contains)]
        ),
        CategoriaCatalogo(id: "stub-aho-desc", nombre: "Desconocido", bucket: .ahorro, icono: "circle-help", esInterna: true),
        CategoriaCatalogo(id: "stub-aho-fondo", nombre: "Fondo de emergencia", bucket: .ahorro, icono: "piggy-bank"),
    ]

    init() { items = Self.seed }

    var all: [CategoriaCatalogo] { lock.withLock { items.sorted { $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending } } }

    func category(id: String) -> CategoriaCatalogo? { lock.withLock { items.first { $0.id == id } } }

    /// Like the server: the name is trimmed, 1 to 40 characters, unique within its bucket
    /// without regard to case; an icon must be on the allowed list.
    func create(_ new: NuevaCategoria) throws -> CategoriaCatalogo {
        let name = new.nombre.trimmingCharacters(in: .whitespaces)
        guard (1...40).contains(name.count) else { throw CategoriaError.invalidName }
        if let icon = new.icono, !CategoryIcon.allowedValues.contains(icon) { throw CategoriaError.invalidIcon }
        return try lock.withLock {
            guard !isTaken(name, in: new.bucket, except: nil) else { throw CategoriaError.duplicateName }
            let text = new.patron?.trimmingCharacters(in: .whitespaces)
            var patterns: [PatronCategoria] = []
            if let text, !text.isEmpty { patterns.append(newPattern(text, .contains)) }
            let category = CategoriaCatalogo(
                id: "stub-new-\(nextID)", nombre: name, bucket: new.bucket, icono: new.icono, patrones: patterns
            )
            nextID += 1
            items.append(category)
            return category
        }
    }

    func update(id: String, _ changes: CategoriaCambios) throws -> CategoriaCatalogo {
        try lock.withLock {
            guard let index = items.firstIndex(where: { $0.id == id }) else { throw CategoriaError.notFound }
            let current = items[index]
            guard !current.esInterna else { throw CategoriaError.isInternal }
            let name = changes.nombre?.trimmingCharacters(in: .whitespaces) ?? current.nombre
            guard (1...40).contains(name.count) else { throw CategoriaError.invalidName }
            if let icon = changes.icono, !CategoryIcon.allowedValues.contains(icon) { throw CategoriaError.invalidIcon }
            let bucket = changes.bucket ?? current.bucket
            guard !isTaken(name, in: bucket, except: id) else { throw CategoriaError.duplicateName }
            let updated = CategoriaCatalogo(
                id: id, nombre: name, bucket: bucket, icono: changes.icono ?? current.icono,
                transaccionesCount: current.transaccionesCount, esInterna: false, patrones: current.patrones
            )
            items[index] = updated
            return updated
        }
    }

    /// Removes the category and answers the «Desconocido» of its bucket, where its movements go.
    func delete(id: String) throws -> CategoriaCatalogo {
        try lock.withLock {
            guard let index = items.firstIndex(where: { $0.id == id }) else { throw CategoriaError.notFound }
            guard !items[index].esInterna else { throw CategoriaError.isInternal }
            let bucket = items[index].bucket
            items.remove(at: index)
            return items.first { $0.bucket == bucket && $0.esInterna }!
        }
    }

    func addPattern(categoryId: String, text: String, type: MatchType) throws -> PatronCategoria {
        let text = text.trimmingCharacters(in: .whitespaces)
        try Self.validate(text, type)
        return try lock.withLock {
            guard let index = items.firstIndex(where: { $0.id == categoryId }) else { throw PatronError.categoryNotFound }
            guard !hasPattern(text, except: nil) else { throw PatronError.duplicate }
            let pattern = newPattern(text, type)
            replacePatterns(at: index) { $0 + [pattern] }
            return pattern
        }
    }

    func updatePattern(id: String, _ changes: PatronCambios) throws -> PatronCategoria {
        try lock.withLock {
            guard let (cIndex, pIndex) = locate(pattern: id) else { throw PatronError.patternNotFound }
            let current = items[cIndex].patrones[pIndex]
            let text = changes.patron?.trimmingCharacters(in: .whitespaces) ?? current.patron
            let type = changes.matchType ?? current.matchType
            try Self.validate(text, type)
            guard !hasPattern(text, except: id) else { throw PatronError.duplicate }
            let updated = PatronCategoria(id: id, patron: text, matchType: type)
            replacePatterns(at: cIndex) { list in list.map { $0.id == id ? updated : $0 } }
            return updated
        }
    }

    func deletePattern(id: String) throws {
        try lock.withLock {
            guard let (cIndex, _) = locate(pattern: id) else { throw PatronError.patternNotFound }
            replacePatterns(at: cIndex) { list in list.filter { $0.id != id } }
        }
    }

    /// Rows with no suggestion whose description matches a pattern take that pattern's category
    /// (regular expressions are not evaluated by the stub).
    func apply(to rows: [CartolaRow]) -> [CartolaRow] {
        let current = lock.withLock { items }
        return rows.map { row in
            guard row.sugerido == nil else { return row }
            let text = row.descripcion.lowercased()
            let match = current.first { category in
                category.patrones.contains { pattern in
                    let needle = pattern.patron.lowercased()
                    switch pattern.matchType {
                    case .contains: return text.contains(needle)
                    case .startsWith: return text.hasPrefix(needle)
                    case .regex, .other: return false
                    }
                }
            }
            guard let match else { return row }
            return CartolaRow(
                rowIndex: row.rowIndex, fecha: row.fecha, descripcion: row.descripcion, cargo: row.cargo,
                abono: row.abono, esDuplicado: row.esDuplicado,
                sugerido: .init(bucket: match.bucket, categoriaId: match.id)
            )
        }
    }

    // MARK: locked helpers

    private static func validate(_ text: String, _ type: MatchType) throws {
        guard (1...200).contains(text.count) else { throw PatronError.invalidPattern }
        switch type {
        case .regex: if (try? NSRegularExpression(pattern: text)) == nil { throw PatronError.invalidRegex }
        case .other: throw PatronError.invalidMatchType
        default: break
        }
    }

    private func isTaken(_ name: String, in bucket: Bucket, except id: String?) -> Bool {
        items.contains { $0.bucket == bucket && $0.id != id && $0.nombre.lowercased() == name.lowercased() }
    }

    private func hasPattern(_ text: String, except id: String?) -> Bool {
        items.contains { $0.patrones.contains { $0.id != id && $0.patron.lowercased() == text.lowercased() } }
    }

    private func newPattern(_ text: String, _ type: MatchType) -> PatronCategoria {
        defer { nextPatternID += 1 }
        return PatronCategoria(id: "stub-pat-\(nextPatternID)", patron: text, matchType: type)
    }

    private func locate(pattern id: String) -> (Int, Int)? {
        for (cIndex, category) in items.enumerated() {
            if let pIndex = category.patrones.firstIndex(where: { $0.id == id }) { return (cIndex, pIndex) }
        }
        return nil
    }

    private func replacePatterns(at index: Int, _ change: ([PatronCategoria]) -> [PatronCategoria]) {
        let current = items[index]
        items[index] = CategoriaCatalogo(
            id: current.id, nombre: current.nombre, bucket: current.bucket, icono: current.icono,
            transaccionesCount: current.transaccionesCount, esInterna: current.esInterna,
            patrones: change(current.patrones)
        )
    }
}
