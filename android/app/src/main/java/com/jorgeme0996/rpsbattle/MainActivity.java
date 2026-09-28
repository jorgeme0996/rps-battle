package com.jorgeme0996.rpsbattle;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Same layout on every Android version: the window draws behind transparent
        // system bars (light icons), and Capacitor shrinks the WebView to sit between
        // them (capacitor.config.json: android.adjustMarginsForEdgeToEdge = "force").
        // The dark window background shows behind the status and navigation bars.
        // Called after super.onCreate so the window decor is created with the app
        // theme (BridgeActivity switches from the launch theme there), not the splash one.
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
    }
}
