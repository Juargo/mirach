import Foundation
import Testing

/// App Store requirements that live in the built bundle: the privacy manifest and the
/// export-compliance key. The unit tests run hosted inside the app, so `Bundle.main`
/// is the app bundle.
struct PrivacyManifestTests {
    private func manifest() throws -> [String: Any] {
        let url = try #require(
            Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"),
            "PrivacyInfo.xcprivacy is not bundled in the app"
        )
        let data = try Data(contentsOf: url)
        return try #require(
            try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        )
    }

    @Test
    func declaresThatTheAppDoesNotUseNonExemptEncryption() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool == false)
    }

    @Test
    func declaresNoTracking() throws {
        let manifest = try manifest()
        #expect(manifest["NSPrivacyTracking"] as? Bool == false)
        #expect((manifest["NSPrivacyTrackingDomains"] as? [String]) == [])
    }

    /// The app reads a picked file's size (`.fileSizeKey`), which is not a required-reason
    /// API (only timestamps, disk space, boot time, user defaults and active keyboards are),
    /// and it uses none of those. If this fails, a required-reason API was declared or added:
    /// check the reason code against Apple's list before changing the expectation.
    @Test
    func declaresNoRequiredReasonApis() throws {
        let declared = try #require(try manifest()["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        #expect(declared.isEmpty)
    }

    @Test
    func declaresTheCollectedDataTypesLinkedToTheUserForAppFunctionality() throws {
        let collected = try #require(try manifest()["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let types = collected.compactMap { $0["NSPrivacyCollectedDataType"] as? String }
        #expect(Set(types) == [
            "NSPrivacyCollectedDataTypeName",
            "NSPrivacyCollectedDataTypeEmailAddress",
            "NSPrivacyCollectedDataTypeUserID",
            "NSPrivacyCollectedDataTypeOtherFinancialInfo",
        ])
        #expect(types.count == Set(types).count, "a data type is declared twice")
        for entry in collected {
            #expect(entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == true)
            #expect(entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false)
            #expect(
                entry["NSPrivacyCollectedDataTypePurposes"] as? [String]
                    == ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
            )
        }
    }
}
