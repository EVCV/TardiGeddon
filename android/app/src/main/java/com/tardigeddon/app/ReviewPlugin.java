package com.tardigeddon.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Google Play's own "rate this game" card (the Play In-App Review API): the
 * native half of src/review.ts. Play decides whether it actually shows (it
 * rations it per player, and only in builds installed from Play) and never
 * tells the app, so this resolves either way.
 */
@CapacitorPlugin(name = "Review")
public class ReviewPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || getActivity() == null) {
                call.resolve();
                return;
            }
            manager.launchReviewFlow(getActivity(), task.getResult()).addOnCompleteListener(done -> call.resolve());
        });
    }
}
