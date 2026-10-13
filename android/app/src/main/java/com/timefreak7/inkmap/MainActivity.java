package com.timefreak7.inkmap;

import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
    }
}
