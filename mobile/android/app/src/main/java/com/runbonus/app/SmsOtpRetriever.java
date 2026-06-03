package com.runbonus.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.Bridge;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.auth.api.phone.SmsRetrieverClient;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Слушает SMS с хешем приложения и передаёт 6-значный код в WebView. */
public final class SmsOtpRetriever {
    private static final String TAG = "RunBonusSms";
    private static final Pattern CODE_PATTERN = Pattern.compile("(?:\\D|^)(\\d{6})(?:\\D|$)");

    private final MainActivity activity;
    private BroadcastReceiver receiver;
    private boolean registered;

    public SmsOtpRetriever(MainActivity activity) {
        this.activity = activity;
    }

    public void start() {
        SmsRetrieverClient client = SmsRetriever.getClient(activity);
        client.startSmsRetriever()
                .addOnSuccessListener(
                        unused -> Log.d(TAG, "SMS Retriever started"))
                .addOnFailureListener(
                        e -> Log.w(TAG, "SMS Retriever start failed", e));
        registerReceiverIfNeeded();
    }

    public void stop() {
        if (receiver != null && registered) {
            try {
                activity.unregisterReceiver(receiver);
            } catch (Exception ignored) {
                /* already unregistered */
            }
            registered = false;
        }
    }

    private void registerReceiverIfNeeded() {
        if (registered) {
            return;
        }
        receiver =
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) {
                            return;
                        }
                        if (intent.getExtras() == null) {
                            return;
                        }
                        Status status = (Status) intent.getExtras().get(SmsRetriever.EXTRA_STATUS);
                        if (status == null
                                || status.getStatusCode() != CommonStatusCodes.SUCCESS) {
                            return;
                        }
                        String message =
                                (String) intent.getExtras().get(SmsRetriever.EXTRA_SMS_MESSAGE);
                        String code = extractCode(message);
                        if (code != null) {
                            deliverCodeToWebView(code);
                        }
                    }
                };

        IntentFilter filter = new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            activity.registerReceiver(receiver, filter);
        }
        registered = true;
    }

    private static String extractCode(String message) {
        if (message == null) {
            return null;
        }
        Matcher m = CODE_PATTERN.matcher(message);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    private void deliverCodeToWebView(String code) {
        activity.runOnUiThread(
                () -> {
                    Bridge bridge = activity.getBridge();
                    if (bridge == null) {
                        return;
                    }
                    android.webkit.WebView webView = bridge.getWebView();
                    if (webView == null) {
                        return;
                    }
                    String safe = code.replace("\\", "\\\\").replace("'", "\\'");
                    String js =
                            "window.dispatchEvent(new CustomEvent('runbonus-sms-otp',{detail:'"
                                    + safe
                                    + "'}));";
                    webView.evaluateJavascript(js, null);
                });
    }
}
