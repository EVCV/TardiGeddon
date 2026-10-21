package com.tardigeddon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManager;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityTokenRequest;

/**
 * Google's sealed verdict about this copy of the game, this phone and this
 * Play account (the Play Integrity API, a "classic" request: only for buying
 * coins, which is rare). The game server opens it and checks it before a
 * purchase starts and before its coins are added (server/googlePlay.ts);
 * src/shop/playIntegrity.ts is the JavaScript half. The app itself never
 * sees what's inside.
 */
@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {

    private IntegrityManager manager;

    @PluginMethod
    public void token(PluginCall call) {
        String nonce = call.getString("nonce");
        if (nonce == null || nonce.isEmpty()) {
            call.reject("No nonce");
            return;
        }
        if (manager == null) manager = IntegrityManagerFactory.create(getContext().getApplicationContext());
        // Apps from Google Play don't set a Cloud project number: the Play Console links one.
        manager.requestIntegrityToken(IntegrityTokenRequest.builder().setNonce(nonce).build())
            .addOnSuccessListener(r -> {
                JSObject ret = new JSObject();
                ret.put("token", r.token());
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage())));
    }
}
