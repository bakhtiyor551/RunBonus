package com.runbonus.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.util.Base64;
import android.util.Log;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;

/** Хеш подписи приложения для SMS Retriever (11 символов). */
public final class AppSignatureHelper {
    private static final String TAG = "RunBonusSms";
    private static final int NUM_HASHED_BYTES = 9;
    private static final int NUM_BASE64_CHAR = 11;

    private AppSignatureHelper() {}

    public static ArrayList<String> getAppSignatures(Context context) {
        ArrayList<String> appCodes = new ArrayList<>();
        try {
            String packageName = context.getPackageName();
            PackageManager pm = context.getPackageManager();
            PackageInfo packageInfo =
                    pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
            if (packageInfo.signatures == null) {
                return appCodes;
            }
            for (Signature signature : packageInfo.signatures) {
                String hash = hash(packageName, signature.toCharsString());
                if (hash != null) {
                    appCodes.add(hash);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Unable to obtain app hash", e);
        }
        return appCodes;
    }

    private static String hash(String packageName, String signature) {
        String appInfo = packageName + " " + signature;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(appInfo.getBytes(StandardCharsets.ISO_8859_1));
            byte[] digest = md.digest();
            byte[] truncated = new byte[NUM_HASHED_BYTES];
            System.arraycopy(digest, 0, truncated, 0, NUM_HASHED_BYTES);
            String base64 =
                    Base64.encodeToString(truncated, Base64.NO_PADDING | Base64.NO_WRAP);
            return base64.substring(0, NUM_BASE64_CHAR);
        } catch (Exception e) {
            return null;
        }
    }
}
