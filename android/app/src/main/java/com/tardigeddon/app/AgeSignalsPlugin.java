package com.tardigeddon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
// Play Age Signals 0.0.4 keeps its types in these two packages.
import com.google.android.play.agesignals.*;
import com.google.android.play.agesignals.model.*;

/**
 * The player's age band from Google Play (the Play Age Signals API), for
 * Brazil's Digital ECA and US state app-store laws (Texas SB 2420): apps
 * that children and teenagers are likely to use must read it. The game only
 * uses it to adjust the coin shop (src/shop/ageSignals.ts). It never reads
 * installId: Family Link stops the app itself when a parent revokes approval. Nothing is sent to our server, and the game never asks
 * anyone their age itself.
 *
 * Asking may show Google's own "share your age range?" prompt, so the game
 * asks only when the player opens the coin packs.
 */
@CapacitorPlugin(name = "AgeSignals")
public class AgeSignalsPlugin extends Plugin {

    private AgeSignalsManager manager;

    @PluginMethod
    public void check(PluginCall call) {
        if (manager == null) manager = AgeSignalsManagerFactory.create(getContext().getApplicationContext());
        AgeSignalsAccessRequest access = AgeSignalsAccessRequest.builder().setActivity(getActivity()).build();
        manager.requestAgeSignalsAccess(access)
            .addOnSuccessListener(accessResult -> {
                Integer status = accessResult.ageSignalsStatus();
                if (status != null && status == AgeSignalsStatus.VERIFICATION_REQUIRED) {
                    call.resolve(result("verification_required"));
                } else if (status != null && status == AgeSignalsStatus.SHARED) {
                    read(call);
                } else {
                    call.resolve(result("not_shared"));
                }
            })
            .addOnFailureListener(e -> call.resolve(failed(e)));
    }

    private void read(PluginCall call) {
        manager.checkAgeSignals(AgeSignalsRequest.builder().build())
            .addOnSuccessListener(r -> {
                JSObject ret = result("shared");
                Integer lower = r.ageLower();
                Integer upper = r.ageUpper();
                if (lower != null) ret.put("lower", lower);
                if (upper != null) ret.put("upper", upper);
                Integer change = r.significantChangeStatus();
                if (change != null && change == SignificantChangeStatus.APPROVED) ret.put("change", "approved");
                else if (change != null && change == SignificantChangeStatus.PENDING) ret.put("change", "pending");
                else if (change != null && change == SignificantChangeStatus.DECLINED) ret.put("change", "declined");
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.resolve(failed(e)));
    }

    private static JSObject result(String status) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        return ret;
    }

    /** Not installed from Play, no Play Store, no connection...: the game carries on as usual. */
    private static JSObject failed(Exception e) {
        JSObject ret = result("error");
        ret.put("message", String.valueOf(e.getMessage()));
        return ret;
    }
}
