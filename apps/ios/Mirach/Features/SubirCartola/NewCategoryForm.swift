import SwiftUI

/// "Crear categoría": name, group and, when the caller offers them, a pattern prefilled with the
/// movement's description and an icon. Advanced match types are added later from the category.
/// It knows nothing of the screen it serves: state and the create action come in as values.
struct NewCategoryForm: View {
    let errors: SubirCartolaViewModel.CategoryFormErrors
    let isCreating: Bool
    let onAppear: () -> Void
    let onCreate: (NuevaCategoria) -> Void
    /// This sheet may not ask for a pattern (they are added later from the category).
    let offersPattern: Bool
    /// Only the Categorías screen offers the icon; the review sheets keep the short form.
    let offersIcon: Bool

    @State private var name = ""
    @State private var bucket: Bucket?
    @State private var pattern: String
    @State private var icon: String?

    /// `initialPattern == nil` hides the pattern field.
    init(
        initialPattern: String?, errors: SubirCartolaViewModel.CategoryFormErrors, isCreating: Bool,
        onAppear: @escaping () -> Void, onCreate: @escaping (NuevaCategoria) -> Void, offersIcon: Bool = false
    ) {
        self.errors = errors
        self.isCreating = isCreating
        self.onAppear = onAppear
        self.onCreate = onCreate
        offersPattern = initialPattern != nil
        self.offersIcon = offersIcon
        // The API takes 1 to 200 characters.
        _pattern = State(initialValue: String((initialPattern ?? "").trimmingCharacters(in: .whitespaces).prefix(200)))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MirachSpacing.m) {
                field("Nombre") {
                    TextField("Nombre", text: $name)
                        .mirachField(isError: errors.name != nil)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .accessibilityIdentifier("category.name")
                    fieldError(errors.name, id: "category.error.name")
                }

                field("Grupo") {
                    BucketSegmentedControl(selection: $bucket, idPrefix: "category")
                    fieldError(errors.bucket, id: "category.error.bucket")
                    Text("Define cómo cuenta este gasto en tu 50/30/20; puedes cambiarlo después, pero afecta todos los meses.")
                        .mirachText(.etiqueta)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }

                if offersIcon {
                    field("Ícono (opcional)") {
                        IconPicker(selection: icon, allowsNone: true, idPrefix: "category") { icon = $0 }
                    }
                }

                if offersPattern {
                    field("Patrón (opcional)") {
                        TextField("Texto a buscar", text: $pattern)
                            .mirachField(isError: errors.pattern != nil)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .accessibilityIdentifier("category.pattern")
                        fieldError(errors.pattern, id: "category.error.pattern")
                        Text("Si la descripción de un movimiento contiene este texto, queda en esta categoría. No ignora tildes. Déjalo vacío para asignarla solo a mano.")
                            .mirachText(.etiqueta)
                            .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    }
                }

                if let general = errors.general {
                    Text(general)
                        .mirachText(.cuerpo)
                        .foregroundStyle(Color.Mirach.Feedback.errorText)
                        .accessibilityIdentifier("category.error.general")
                }
            }
            .padding(.horizontal, MirachSpacing.l)
            .padding(.vertical, MirachSpacing.m)
        }
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("category.form")
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        // Figma 29: the one action sits at the foot of the screen.
        .safeAreaInset(edge: .bottom) {
            Button(action: save) {
                if isCreating {
                    ProgressView().accessibilityLabel("Creando…")
                } else {
                    Text("Crear categoría")
                }
            }
            .prominentButton()
            .disabled(!canSave)
            .accessibilityIdentifier("category.save")
            .padding(.horizontal, MirachSpacing.l)
            .padding(.vertical, MirachSpacing.s)
            .background(Color.Mirach.Base.background)
        }
        .navigationTitle("Nueva categoría")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: onAppear)
    }

    /// A section label over its field(s), the Figma «Campo» stack.
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            SectionLabel(title)
            content()
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && bucket != nil && !isCreating
    }

    private func save() {
        guard let bucket else { return }
        onCreate(NuevaCategoria(
            nombre: name.trimmingCharacters(in: .whitespaces), bucket: bucket, patron: offersPattern ? pattern : nil,
            icono: offersIcon ? icon : nil
        ))
    }

    @ViewBuilder
    private func fieldError(_ text: String?, id: String) -> some View {
        if let text {
            Text(text)
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityIdentifier(id)
        }
    }
}
