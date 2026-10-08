import Testing
@testable import Mirach

struct CategoriasPresentationTests {
    private func category(movements: Int, patterns: Int, isSystem: Bool = false) -> CategoriaCatalogo {
        CategoriaCatalogo(
            id: "c", nombre: "Supermercado", bucket: .necesidades, transaccionesCount: movements, esInterna: isSystem,
            patrones: (0..<patterns).map { PatronCategoria(id: "p\($0)", patron: "x\($0)", matchType: .contains) }
        )
    }

    @Test func theCountsUseTheSingularAndThePluralOfBothNouns() {
        #expect(CategoriasPresentation.counts(category(movements: 12, patterns: 2)) == "12 movimientos · 2 patrones")
        #expect(CategoriasPresentation.counts(category(movements: 1, patterns: 1)) == "1 movimiento · 1 patrón")
        #expect(CategoriasPresentation.counts(category(movements: 0, patterns: 0)) == "0 movimientos · 0 patrones")
    }

    @Test func theSpokenRowNamesTheCategoryItsCountsAndThatItIsASystemOne() {
        #expect(CategoriasPresentation.rowLabel(category(movements: 12, patterns: 2)) == "Supermercado. 12 movimientos. 2 patrones")
        #expect(CategoriasPresentation.rowLabel(category(movements: 0, patterns: 0, isSystem: true))
            == "Supermercado. 0 movimientos. 0 patrones. Categoría del sistema")
    }

    @Test func everyIconOfTheListHasASpokenNameAndAnUnknownOneHasNone() {
        for option in CategoryIcon.options {
            #expect(CategoryIcon.label(for: option.value) == option.label)
            #expect(!option.label.isEmpty)
        }
        #expect(CategoryIcon.label(for: nil) == nil)
        #expect(CategoryIcon.label(for: "rocket") == nil)
    }

    @Test func theIconListKeepsTheCatalogsOrderAndHasNoRepeats() {
        #expect(CategoryIcon.options.count == 25)
        #expect(Set(CategoryIcon.allowedValues).count == 25)
        #expect(CategoryIcon.allowedValues.first == "shopping-cart")
        #expect(CategoryIcon.allowedValues.last == "circle-help")
    }
}
