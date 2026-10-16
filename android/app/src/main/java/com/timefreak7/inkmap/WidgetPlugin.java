package com.timefreak7.inkmap;

import android.content.Context;
import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The app sends its counts and theme colour here whenever they change; the widget shows the last ones sent.
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        int colour;
        try { colour = Color.parseColor(call.getString("colour", "#5ee0c8")); } catch (IllegalArgumentException e) { colour = 0xFF5EE0C8; }
        getContext().getSharedPreferences(InkmapWidget.PREFS, Context.MODE_PRIVATE).edit()
            .putInt("continents", call.getInt("continents", 0))
            .putInt("countries", call.getInt("countries", 0))
            .putInt("cities", call.getInt("cities", 0))
            .putInt("colour", colour)
            .apply();
        InkmapWidget.refresh(getContext());
        call.resolve();
    }
}
