package com.timefreak7.inkmap;

import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoScanPlugin.class);
        registerPlugin(BackupFolderPlugin.class);
        registerPlugin(FileSharePlugin.class);
        registerPlugin(CalendarPlugin.class);
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Ask for the screen's fastest refresh rate; some phones otherwise hold WebView apps at 60 or 90 Hz.
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode best = display.getMode();
        for (Display.Mode m : display.getSupportedModes()) {
            if (m.getPhysicalWidth() == best.getPhysicalWidth() && m.getPhysicalHeight() == best.getPhysicalHeight()
                    && m.getRefreshRate() > best.getRefreshRate()) best = m;
        }
        WindowManager.LayoutParams params = getWindow().getAttributes();
        params.preferredDisplayModeId = best.getModeId();
        getWindow().setAttributes(params);

        // Back closes the screen on top (country view, a sheet, Stats) instead of quitting the app.
        // The page answers true if it closed something; otherwise back does its normal job and leaves the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                bridge.getWebView().evaluateJavascript("!!(window.inkmapBack && window.inkmapBack())", handled -> {
                    if (!"true".equals(handled)) {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });
    }
}
