package com.runbonus.app

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import android.util.Base64
import android.util.Log
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/** Хеш подписи приложения для SMS Retriever (11 символов) — его нужно добавить в текст SMS на бэкенде. */
object AppSignatureHelper {
    private const val TAG = "RunBonusSms"
    private const val NUM_HASHED_BYTES = 9
    private const val NUM_BASE64_CHAR = 11

    fun getAppSignatures(context: Context): List<String> = try {
        val pm = context.packageManager
        val name = context.packageName
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = pm.getPackageInfo(name, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo
            if (info == null) emptyArray<Signature>()
            else if (info.hasMultipleSigners()) info.apkContentsSigners
            else info.signingCertificateHistory
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(name, PackageManager.GET_SIGNATURES).signatures
        }
        signatures.orEmpty().mapNotNull { hash(name, it.toCharsString()) }
    } catch (e: Exception) {
        Log.e(TAG, "Unable to obtain app hash", e)
        emptyList()
    }

    private fun hash(packageName: String, signature: String): String? = runCatching {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("$packageName $signature".toByteArray(StandardCharsets.ISO_8859_1))
        Base64.encodeToString(digest.copyOf(NUM_HASHED_BYTES), Base64.NO_PADDING or Base64.NO_WRAP)
            .substring(0, NUM_BASE64_CHAR)
    }.getOrNull()
}
