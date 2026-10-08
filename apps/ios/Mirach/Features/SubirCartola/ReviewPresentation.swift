import Foundation

/// How the review shows a row: its classification and the grouping of the list. Pure
/// functions of the rows, the edits and the catalog, so they are tested without a screen.
enum ReviewPresentation {
    struct Classification: Hashable {
        let bucket: Bucket
        let name: String
        /// «Necesidades · Supermercado»
        var text: String { "\(bucket.label) · \(name)" }
    }

    struct Section: Identifiable, Equatable {
        let id: String
        let title: String
        /// `nil` for the section of already loaded rows.
        let bucket: Bucket?
        let rows: [CartolaRow]
    }

    static let unknownCategoryName = "Desconocido"
    static let unresolvedCategoryName = "Otra categoría"
    static let duplicatesTitle = "Ya cargados"
    static let incomeTitle = "Ingreso"

    /// What the row shows: the person's choice if there is one, else what the server suggested.
    /// A row with no suggestion is «Deseos · Desconocido» (the server's default).
    static func classification(of row: CartolaRow, edit: String?, catalog: CatalogoCategorias?) -> Classification {
        if let edit {
            return resolve(edit, fallbackBucket: row.sugerido?.bucket ?? .deseos, catalog: catalog)
        }
        guard let suggestion = row.sugerido else {
            return Classification(bucket: .deseos, name: unknownCategoryName)
        }
        guard let id = suggestion.categoriaId else {
            return Classification(bucket: suggestion.bucket, name: unknownCategoryName)
        }
        return resolve(id, fallbackBucket: suggestion.bucket, catalog: catalog)
    }

    private static func resolve(_ id: String, fallbackBucket: Bucket, catalog: CatalogoCategorias?) -> Classification {
        guard let category = catalog?.categoria(id: id) else {
            // An id the catalog does not list (it changed since the preview): keep the bucket.
            return Classification(bucket: fallbackBucket, name: unresolvedCategoryName)
        }
        return Classification(bucket: category.bucket, name: category.nombre)
    }

    /// Rows grouped by bucket and category (Necesidades, Deseos, Ahorro; categories in the
    /// catalog's order), each group by `rowIndex`. Rows already loaded go last, apart: they
    /// cannot be edited, so they would only crowd the groups that can.
    static func sections(rows: [CartolaRow], edits: [Int: String], catalog: CatalogoCategorias?) -> [Section] {
        let editable = rows.filter(\.isEditable)
        let grouped = Dictionary(grouping: editable) {
            classification(of: $0, edit: edits[$0.rowIndex], catalog: catalog)
        }
        func position(_ classification: Classification) -> (Int, Int, String) {
            let bucketIndex = Bucket.allCases.firstIndex(of: classification.bucket) ?? Bucket.allCases.count
            let categoryIndex = catalog?.categorias.firstIndex {
                $0.bucket == classification.bucket && $0.nombre == classification.name
            } ?? Int.max
            return (bucketIndex, categoryIndex, classification.name)
        }
        var sections = grouped.keys.sorted { position($0) < position($1) }.map { key in
            Section(
                id: key.text, title: key.text, bucket: key.bucket,
                rows: grouped[key]!.sorted { $0.rowIndex < $1.rowIndex }
            )
        }
        // Incomes are imported as «Ingreso» whatever the person does: shown apart, not editable.
        let incomes = rows.filter { !$0.esDuplicado && $0.esIngreso }.sorted { $0.rowIndex < $1.rowIndex }
        if !incomes.isEmpty {
            sections.append(Section(id: "ingresos", title: incomeTitle, bucket: nil, rows: incomes))
        }
        let loaded = rows.filter(\.esDuplicado).sorted { $0.rowIndex < $1.rowIndex }
        if !loaded.isEmpty {
            sections.append(Section(id: "duplicados", title: duplicatesTitle, bucket: nil, rows: loaded))
        }
        return sections
    }
}

extension CartolaRow {
    /// The server's rule (commit Rule 2): a credit with no debit is always imported as «Ingreso»
    /// with no category, and any edit for it is ignored.
    var esIngreso: Bool { abono > 0 && cargo == 0 }

    /// Only a new expense-like row can take a category.
    var isEditable: Bool { !esDuplicado && !esIngreso }

    /// `-$25.990` for an expense, `+$1.200.000` for an income.
    var amountText: String { cargo != 0 ? Format.expense(cargo) : Format.income(abono) }

    var spokenAmount: String {
        if cargo != 0 { return Format.spokenExpense(cargo) }
        return abono != 0 ? "Ingreso de \(Format.money(abono))" : "Sin monto"
    }
}
