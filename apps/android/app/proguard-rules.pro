# Most libraries ship their own consumer rules and need nothing here:
#  - kotlinx.serialization keeps serializers of every serializable class that survives shrinking
#    (only classes with NAMED companion objects need extra rules; none here, checked with
#    `rg "companion object [A-Za-z]"`).
#  - Retrofit 3 keeps annotated service methods and the Continuation type for suspend functions.
#  - OkHttp 5, androidx.credentials and googleid bring their own rules.
#
# The rules below are belt and braces for what a runtime failure would make hard to diagnose.

# Retrofit reads generic return types and annotations by reflection (suspend functions included).
-keepattributes Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault

# Generated Retrofit interfaces (core/api/generated/apis): Retrofit builds a java.lang.reflect.Proxy for them.
-keep interface app.mirachbudget.android.core.api.generated.apis.** { *; }

# Generated request/response models are decoded by kotlinx.serialization (enums use @SerialName values).
-keepclassmembers class app.mirachbudget.android.core.api.generated.models.** { *; }

-keep interface app.mirachbudget.android.core.networking.CuentaApi { *; }
