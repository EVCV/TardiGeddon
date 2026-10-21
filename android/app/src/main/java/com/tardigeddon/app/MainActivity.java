package com.tardigeddon.app;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own plugin (Capacitor finds the npm ones by itself).
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(DisplayPlugin.class);
        registerPlugin(AgeSignalsPlugin.class);
        registerPlugin(PlayIntegrityPlugin.class);
        super.onCreate(savedInstanceState);
        // Android's font size setting would enlarge only the text, not the buttons
        // around it, so words spilled out of FIRE and friends. The game scales its
        // whole interface by the same amount instead (DisplayPlugin, src/ui/textSize.ts).
        getBridge().getWebView().getSettings().setTextZoom(100);
        // The screen stays on while the game is open (turns can be slow to think about).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Full screen: hide the status and navigation bars; a swipe from the edge shows them for a moment.
        if (hasFocus) {
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}
