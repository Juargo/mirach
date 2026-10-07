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
        Form {
            Section {
                TextField("Nombre", text: $name)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .accessibilityIdentifier("category.name")
                fieldError(errors.name, id: "category.error.name")
            } header: { Text("Nombre") }
                .listRowBackground(Color.Mirach.Base.card)

            Section {
                BucketChoice(selection: $bucket, idPrefix: "category")
                fieldError(errors.bucket, id: "category.error.bucket")
            } header: { Text("Grupo") } footer: {
                Text("Define cómo cuenta este gasto en tu 50/30/20; puedes cambiarlo después, pero afecta todos los meses.")
            }
            .listRowBackground(Color.Mirach.Base.card)

            if offersIcon {
                Section {
                    IconPicker(selection: icon, allowsNone: true, idPrefix: "category") { icon = $0 }
                } header: { Text("Ícono (opcional)") }
                    .listRowBackground(Color.Mirach.Base.card)
            }

            if offersPattern {
                Section {
                    TextField("Texto a buscar", text: $pattern)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .accessibilityIdentifier("category.pattern")
                    fieldError(errors.pattern, id: "category.error.pattern")
                } header: { Text("Patrón (opcional)") } footer: {
                    Text("Si la descripción de un movimiento contiene este texto, queda en esta categoría. No ignora tildes. Déjalo vacío para asignarla solo a mano.")
                }
                .listRowBackground(Color.Mirach.Base.card)
            }

            if let general = errors.general {
                Section {
                    Text(general)
                        .foregroundStyle(Color.Mirach.Feedback.errorText)
                        .accessibilityIdentifier("category.error.general")
                }
                .listRowBackground(Color.Mirach.Base.card)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .navigationTitle("Nueva categoría")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if isCreating {
                    ProgressView().accessibilityLabel("Creando…")
                } else {
                    Button("Crear", action: save)
                        .disabled(!canSave)
                        .accessibilityIdentifier("category.save")
                }
            }
        }
        .onAppear(perform: onAppear)
        .accessibilityIdentifier("category.form")
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
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityIdentifier(id)
        }
    }
}

/// Three labeled options, one per row, with a check on the chosen one (not color alone). A row
/// each, instead of a segmented control, so the labels never get squeezed at large text sizes.
/// Shared by the creation form and the category detail; `selection` is `nil` until chosen.
struct BucketChoice: View {
    @Binding var selection: Bucket?
    let idPrefix: String

    var body: some View {
        ForEach(Bucket.allCases, id: \.self) { option in
            Button { selection = option } label: {
                HStack(spacing: 8) {
                    Rectangle().fill(option.fill).frame(width: 14, height: 14).accessibilityHidden(true)
                    Text(option.label)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        // One line shrunk to fit: «Necesidades» must never break by syllable.
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Spacer()
                    if selection == option { Image(systemName: "checkmark").accessibilityHidden(true) }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selection == option ? .isSelected : [])
            .accessibilityIdentifier("\(idPrefix).bucket.\(option.apiName)")
        }
    }
}
