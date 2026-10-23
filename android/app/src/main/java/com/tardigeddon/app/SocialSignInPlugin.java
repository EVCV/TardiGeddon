package com.tardigeddon.app;

import android.net.Uri;
import android.os.CancellationSignal;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Google and Apple sign-in in the app (src/account/nativeSignIn.ts). Their
 * sign-in pages refuse to open inside the app's WebView, so:
 *
 * - Google: Android's own account picker (Credential Manager). It gives an ID
 *   token for the game server's Google client, which the server checks
 *   (Better Auth, /api/auth/sign-in/social).
 * - Apple (no Android version): its web page in a Chrome Custom Tab, which comes
 *   back to the app at com.tardigeddon.app://signin (AndroidManifest.xml; the
 *   @capacitor/app "appUrlOpen" event).
 */
@CapacitorPlugin(name = "SocialSignIn")
public class SocialSignInPlugin extends Plugin {

    /** Google's account picker. Resolves {status: "ok", idToken} | {status: "cancelled" | "no_account" | "error"}. */
    @PluginMethod
    public void google(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty()) {
            call.resolve(failed("no client id"));
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Credential credential = result.getCredential();
                    if (!(credential instanceof CustomCredential) || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.resolve(failed("unexpected credential " + credential.getType()));
                        return;
                    }
                    try {
                        JSObject ret = status("ok");
                        ret.put("idToken", GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken());
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.resolve(failed(String.valueOf(e.getMessage())));
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) call.resolve(status("cancelled"));
                    else if (e instanceof NoCredentialException) call.resolve(status("no_account"));
                    else call.resolve(failed(e.getType() + ": " + e.getMessage()));
                }
            }
        );
    }

    /** Open a page in a Chrome Custom Tab (the browser's sign-in pages, cookies and all). */
    @PluginMethod
    public void openBrowser(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("https only");
            return;
        }
        getActivity().runOnUiThread(() -> {
            new CustomTabsIntent.Builder().build().launchUrl(getActivity(), Uri.parse(url));
            call.resolve();
        });
    }

    private static JSObject status(String status) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        return ret;
    }

    private static JSObject failed(String message) {
        JSObject ret = status("error");
        ret.put("message", message);
        return ret;
    }
}
