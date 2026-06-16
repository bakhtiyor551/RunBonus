package com.runbonus.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "RunBonusSms";
    private SmsOtpRetriever smsOtpRetriever;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkoutTrackingPlugin.class);
        super.onCreate(savedInstanceState);
        disableWebViewSounds();
        logSmsAppHashes();
        smsOtpRetriever = new SmsOtpRetriever(this);
    }

    @Override
    public void onStart() {
        super.onStart();
        disableWebViewSounds();
        if (smsOtpRetriever != null) {
            smsOtpRetriever.start();
        }
    }

    @Override
    public void onStop() {
        if (smsOtpRetriever != null) {
            smsOtpRetriever.stop();
        }
        super.onStop();
    }

    private void logSmsAppHashes() {
        ArrayList<String> hashes = AppSignatureHelper.getAppSignatures(this);
        for (String hash : hashes) {
            Log.i(TAG, "SMS_APP_HASH=" + hash + " (добавьте в backend/.env)");
        }
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
