package app.mirachbudget.android.features.signin

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

sealed interface GoogleSignInResult {
    data class Success(val idToken: String) : GoogleSignInResult

    /** The person closed the sheet: not an error, no message, no API call. */
    data object Cancelled : GoogleSignInResult

    data object Failed : GoogleSignInResult
}

/** Gets a Google ID token from the device. An interface so view models are testable on the JVM. */
fun interface GoogleSignInLauncher {
    suspend fun requestIdToken(): GoogleSignInResult
}

/**
 * Credential Manager with the "Sign in with Google" option (an explicit button, not auto-select).
 * [serverClientId] is the WEB-type OAuth client: it becomes the token's `aud`, which the API checks
 * against `GOOGLE_CLIENT_ID_ANDROID`. [activityContext] must be an Activity (the sheet needs it).
 */
class CredentialManagerGoogleSignIn(
    private val activityContext: Context,
    private val serverClientId: String,
) : GoogleSignInLauncher {
    override suspend fun requestIdToken(): GoogleSignInResult {
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(serverClientId).build())
            .build()
        return try {
            val credential = CredentialManager.create(activityContext).getCredential(activityContext, request).credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleSignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                GoogleSignInResult.Failed
            }
        } catch (_: GetCredentialCancellationException) {
            GoogleSignInResult.Cancelled
        } catch (e: GetCredentialException) {
            // Type only: the message could carry account details.
            Log.w(TAG, "Google sign-in failed: ${e.javaClass.simpleName}")
            GoogleSignInResult.Failed
        } catch (e: GoogleIdTokenParsingException) {
            Log.w(TAG, "Google sign-in returned an unreadable token: ${e.javaClass.simpleName}")
            GoogleSignInResult.Failed
        }
    }

    private companion object {
        const val TAG = "MirachGoogleSignIn"
    }
}
