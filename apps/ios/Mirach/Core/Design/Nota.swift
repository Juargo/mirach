import SwiftUI

/// Figma «Aviso» of type Nota: a box on the surface colour with a title and text lines, for what
/// is explained in place (a preview, a conflict, a protection). The content brings its own text
/// styles; the box owns the padding and the spacing between its lines.
struct Nota<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MirachSpacing.m)
            .background(Color.Mirach.Base.card)
    }
}
