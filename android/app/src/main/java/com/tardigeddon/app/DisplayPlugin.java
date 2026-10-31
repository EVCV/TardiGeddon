package com.tardigeddon.app;

import android.content.ContentResolver;
import android.content.res.Configuration;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's display and accessibility settings the game follows (the iOS
 * app has the same plugin, DisplayPlugin.swift):
 * - Font size (Settings → Display → Font size), for the game's "Text size:
 *   Auto" (src/ui/textSize.ts). MainActivity stops the WebView enlarging only
 *   the text (which spilled out of buttons); the game scales its whole
 *   interface by this instead.
 * - Colour correction (Settings → Accessibility), which turns on the
 *   colour-blind team colours, and High contrast text, which turns on High
 *   contrast (src/ui/access.ts).
 * - Dark theme, for "Look: Auto".
 * The page asks again whenever the app comes back to the front.
 */
@CapacitorPlugin(name = "Display")
public class DisplayPlugin extends Plugin {

    @PluginMethod
    public void fontScale(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("scale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(ret);
    }

    @PluginMethod
    public void accessibility(PluginCall call) {
        Configuration config = getContext().getResources().getConfiguration();
        JSObject ret = new JSObject();
        ret.put("fontScale", config.fontScale);
        ret.put("noColour", secureSetting("accessibility_display_daltonizer_enabled"));
        ret.put("contrast", secureSetting("high_text_contrast_enabled"));
        ret.put("dark", (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
        call.resolve(ret);
    }

    /** An on/off accessibility setting; off if this phone won't say. */
    private boolean secureSetting(String name) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            return Settings.Secure.getInt(resolver, name, 0) == 1;
        } catch (Exception e) {
            return false;
        }
    }
}
