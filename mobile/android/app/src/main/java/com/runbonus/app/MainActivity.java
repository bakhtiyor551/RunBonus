package com.runbonus.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        disableWebViewSounds();
    }

    @Override
    public void onStart() {
        super.onStart();
        disableWebViewSounds();
    }

    private void disableWebViewSounds() {
        try {
            Bridge bridge = getBridge();
            if (bridge == null) {
                return;
            }
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setSoundEffectsEnabled(false);
                webView.setHapticFeedbackEnabled(false);
            }
        } catch (Exception ignored) {
            /* WebView ещё не готов */
        }
    }
}
