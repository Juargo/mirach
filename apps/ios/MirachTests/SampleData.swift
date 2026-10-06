import Foundation
@testable import Mirach

/// Realistic months for view model tests.
enum SampleData {
    static func mes(_ periodo: String, ingreso: Int = 1_000_000, sinIngreso: Bool = false) -> ResumenMes {
        ResumenMes(
            periodo: Periodo(periodo)!,
            sinIngreso: sinIngreso,
            totalIngreso: ingreso,
            estadoGlobal: sinIngreso ? nil : .amarillo,
            buckets: [
                BucketResumen(bucket: .necesidades, total: 450_000, porcentajeBp: sinIngreso ? nil : 4500, metaBp: 5000, estado: .verde),
                BucketResumen(bucket: .deseos, total: 305_000, porcentajeBp: sinIngreso ? nil : 3050, metaBp: 3000, estado: .amarillo),
                BucketResumen(bucket: .ahorro, total: 0, porcentajeBp: sinIngreso ? nil : 0, metaBp: 2000, estado: nil),
            ]
        )
    }

    static let septiembre = mes("2026-09")
}

extension SampleData {
    static let preview = CartolaPreview(
        banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
        totalFilas: 42, duplicados: 5, nuevas: 37
    )
    static let commit = CartolaCommitResult(totalTransacciones: 37, duplicadosOmitidos: 5)
}
