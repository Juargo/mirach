// swift-tools-version:6.0
// Pins the version of Apple's swift-openapi-generator used by ../generate-api.sh.
// This package only exists to resolve and build the generator CLI; it is not part of the app.
import PackageDescription

let package = Package(
    name: "openapi-generator-tool",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1")
    ]
)
