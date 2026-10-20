package com.tardigeddon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's font size setting (Settings → Display → Font size), for the
 * game's "Text size: Auto" (src/ui/textSize.ts). MainActivity stops the
 * WebView enlarging only the text (which spilled out of buttons); the game
 * scales its whole interface by this instead.
 */
@CapacitorPlugin(name = "Display")
public class DisplayPlugin extends Plugin {

    @PluginMethod
    public void fontScale(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("scale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(ret);
    }
}
