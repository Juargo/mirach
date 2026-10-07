import Foundation
import Testing
@testable import Mirach

/// The UI-test stub has to behave like the server for the catalog writes, or the UI tests prove
/// nothing: counts come from the ledger on every answer, names are unique per bucket, a deleted
/// category sends its movements to the bucket's «Desconocido».
struct StubCatalogTests {
    private func counts(_ api: StubMirachAPI) async throws -> [String: Int] {
        Dictionary(uniqueKeysWithValues: try await api.categorias().categorias.map { ($0.id, $0.transaccionesCount) })
    }

    // MARK: counts on every answer

    @Test func updatingACategoryAnswersItsRealMovementCount() async throws {
        let api = StubMirachAPI()

        let renamed = try await api.actualizarCategoria(id: "stub-nec-super", cambios: CategoriaCambios(nombre: "Súper"))

        #expect(renamed.transaccionesCount == 2)
        let moved = try await api.actualizarCategoria(id: "stub-nec-super", cambios: CategoriaCambios(bucket: .ahorro))
        #expect(moved.transaccionesCount == 2)
        #expect(moved.bucket == .ahorro)
    }

    @Test func aCreatedCategoryStartsWithNoMovements() async throws {
        let api = StubMirachAPI()

        let created = try await api.crearCategoria(NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil))

        #expect(created.transaccionesCount == 0)
        #expect(try await counts(api)[created.id] == 0)
    }

    // MARK: create and update validation

    @Test func theNameIsTrimmedLimitedAndUniquePerBucketWithoutRegardToCase() async throws {
        let api = StubMirachAPI()

        let trimmed = try await api.crearCategoria(NuevaCategoria(nombre: "  Mascotas  ", bucket: .deseos, patron: nil))
        #expect(trimmed.nombre == "Mascotas")
        await #expect(throws: CategoriaError.invalidName) {
            try await api.crearCategoria(NuevaCategoria(nombre: "   ", bucket: .deseos, patron: nil))
        }
        await #expect(throws: CategoriaError.invalidName) {
            try await api.crearCategoria(NuevaCategoria(nombre: String(repeating: "a", count: 41), bucket: .deseos, patron: nil))
        }
        await #expect(throws: CategoriaError.duplicateName) {
            try await api.crearCategoria(NuevaCategoria(nombre: "RESTAURANTES", bucket: .deseos, patron: nil))
        }
        // The same name in another bucket is fine (ADR-042).
        let other = try await api.crearCategoria(NuevaCategoria(nombre: "Restaurantes", bucket: .necesidades, patron: nil))
        #expect(other.bucket == .necesidades)
    }

    @Test func anIconOutsideTheAllowedListIsRefused() async throws {
        let api = StubMirachAPI()

        await #expect(throws: CategoriaError.invalidIcon) {
            try await api.crearCategoria(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil, icono: "rocket"))
        }
        await #expect(throws: CategoriaError.invalidIcon) {
            try await api.actualizarCategoria(id: "stub-des-rest", cambios: CategoriaCambios(icono: "rocket"))
        }
    }

    @Test func updatingChecksNameAndUniquenessInTheTargetBucket() async throws {
        let api = StubMirachAPI()

        await #expect(throws: CategoriaError.invalidName) {
            try await api.actualizarCategoria(id: "stub-des-rest", cambios: CategoriaCambios(nombre: ""))
        }
        // «Suscripciones» renamed to the name of its neighbour in Deseos.
        await #expect(throws: CategoriaError.duplicateName) {
            try await api.actualizarCategoria(id: "stub-des-susc", cambios: CategoriaCambios(nombre: "restaurantes"))
        }
        // Moving «Restaurantes» to Necesidades where nothing has that name is fine; keeping its
        // own name is not a clash with itself.
        _ = try await api.actualizarCategoria(id: "stub-des-rest", cambios: CategoriaCambios(nombre: "Restaurantes"))
    }

    @Test func aSystemCategoryCannotBeEditedAndAnUnknownOneIsNotFound() async throws {
        let api = StubMirachAPI()

        await #expect(throws: CategoriaError.isInternal) {
            try await api.actualizarCategoria(id: "stub-nec-desc", cambios: CategoriaCambios(nombre: "Otro"))
        }
        await #expect(throws: CategoriaError.notFound) {
            try await api.actualizarCategoria(id: "nope", cambios: CategoriaCambios(nombre: "Otro"))
        }
    }

    @Test func movingABucketMovesItsMovementsAndTheTotals() async throws {
        let api = StubMirachAPI()
        let before = (api.ledger.total(.necesidades), api.ledger.total(.ahorro))

        _ = try await api.actualizarCategoria(id: "stub-nec-super", cambios: CategoriaCambios(bucket: .ahorro))

        #expect(api.ledger.total(.necesidades) == before.0 - 432_500)
        #expect(api.ledger.total(.ahorro) == before.1 + 432_500)
    }

    // MARK: delete

    @Test func deletingSendsTheMovementsToTheBucketsDesconocido() async throws {
        let api = StubMirachAPI()

        try await api.eliminarCategoria(id: "stub-nec-super")

        let after = try await counts(api)
        #expect(after["stub-nec-super"] == nil)
        #expect(after["stub-nec-desc"] == 2)
        #expect(after["stub-des-desc"] == 0, "another bucket's Desconocido is untouched")
        #expect(api.ledger.total(.necesidades) == 245_300 + 187_200 + 60_000 + 20_000 + 400_000)
    }

    @Test func deletingASystemOrAnUnknownCategoryFails() async throws {
        let api = StubMirachAPI()

        await #expect(throws: CategoriaError.isInternal) { try await api.eliminarCategoria(id: "stub-des-desc") }
        await #expect(throws: CategoriaError.notFound) { try await api.eliminarCategoria(id: "nope") }
    }

    // MARK: patterns

    @Test func aPatternIsTrimmedValidatedAndUniqueAcrossTheCatalogWithoutRegardToCase() async throws {
        let api = StubMirachAPI()

        let added = try await api.crearPatron(categoriaId: "stub-des-rest", patron: "  uber eats ", matchType: .contains)
        #expect(added.patron == "uber eats")
        await #expect(throws: PatronError.duplicate) {
            try await api.crearPatron(categoriaId: "stub-nec-transp", patron: "UBER EATS", matchType: .contains)
        }
        await #expect(throws: PatronError.invalidPattern) {
            try await api.crearPatron(categoriaId: "stub-des-rest", patron: "  ", matchType: .contains)
        }
        await #expect(throws: PatronError.invalidRegex) {
            try await api.crearPatron(categoriaId: "stub-des-rest", patron: "[", matchType: .regex)
        }
        await #expect(throws: PatronError.invalidMatchType) {
            try await api.crearPatron(categoriaId: "stub-des-rest", patron: "X", matchType: .other("ENDS_WITH"))
        }
        await #expect(throws: PatronError.categoryNotFound) {
            try await api.crearPatron(categoriaId: "nope", patron: "X", matchType: .contains)
        }
    }

    @Test func updatingAndDeletingAPatternKeepsTheRestAndFailsForAnUnknownId() async throws {
        let api = StubMirachAPI()

        let changed = try await api.actualizarPatron(id: "stub-p-lider", cambios: PatronCambios(matchType: .startsWith))
        #expect(changed.patron == "LIDER")
        #expect(changed.matchType == .startsWith)
        // Keeping its own text is not a clash with itself; another pattern's text is.
        _ = try await api.actualizarPatron(id: "stub-p-lider", cambios: PatronCambios(patron: "lider"))
        await #expect(throws: PatronError.duplicate) {
            try await api.actualizarPatron(id: "stub-p-lider", cambios: PatronCambios(patron: "netflix"))
        }
        try await api.eliminarPatron(id: "stub-p-lider")
        let category = try #require(try await api.categorias().categoria(id: "stub-nec-super"))
        #expect(category.patrones.map(\.id) == ["stub-p-jumbo"])
        await #expect(throws: PatronError.patternNotFound) { try await api.eliminarPatron(id: "stub-p-lider") }
        await #expect(throws: PatronError.patternNotFound) {
            try await api.actualizarPatron(id: "nope", cambios: PatronCambios(patron: "X"))
        }
    }
}
