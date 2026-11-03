package com.runbonus.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.time.LocalDate
import kotlin.math.max
import kotlin.math.roundToInt

class MainActivity : FlutterActivity(), SensorEventListener {
    private var sensorManager: SensorManager? = null
    private var baselineSteps = -1f
    private var sessionSteps = 0
    private var listening = false

    private var smsSink: EventChannel.EventSink? = null
    private var smsReceiver: BroadcastReceiver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createDefaultNotificationChannel()
        AppSignatureHelper.getAppSignatures(this).forEach {
            Log.i(TAG, "SMS_APP_HASH=$it (добавьте в backend/.env)")
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, "runbonus/workout").setMethodCallHandler { call, result ->
            when (call.method) {
                "startSession" -> {
                    startStepListener()
                    result.success(mapOf("ok" to true))
                }
                "stopSession" -> {
                    stopStepListener()
                    result.success(mapOf("ok" to true))
                }
                "getSteps" -> result.success(mapOf("steps" to sessionSteps))
                "getDailySteps" -> readDailySteps { result.success(mapOf("steps" to it)) }
                "updateLiveActivity" -> result.success(mapOf("ok" to false))
                "endLiveActivity" -> result.success(mapOf("ok" to true))
                "getLiveActivityStatus" -> result.success(mapOf("supported" to false, "enabled" to false))
                "minimizeApp" -> {
                    moveTaskToBack(true)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }

        EventChannel(messenger, "runbonus/sms_otp").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                smsSink = events
                startSmsRetriever()
            }

            override fun onCancel(arguments: Any?) {
                smsSink = null
                stopSmsRetriever()
            }
        })
    }

    /** Системное «назад» на корневом экране сворачивает приложение, а не закрывает его. */
    override fun popSystemNavigator(): Boolean {
        moveTaskToBack(true)
        return true
    }

    override fun onDestroy() {
        stopSmsRetriever()
        stopStepListener()
        super.onDestroy()
    }

    // —— Шаги (TYPE_STEP_COUNTER) ——

    private fun stepCounter(): Sensor? {
        val manager = sensorManager ?: (getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.also { sensorManager = it }
        return manager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    }

    private fun startStepListener() {
        if (listening) return
        val sensor = stepCounter() ?: return
        baselineSteps = -1f
        sessionSteps = 0
        sensorManager?.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        listening = true
    }

    private fun stopStepListener() {
        if (listening) sensorManager?.unregisterListener(this)
        listening = false
        baselineSteps = -1f
        sessionSteps = 0
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
        val total = event.values[0]
        if (baselineSteps < 0) baselineSteps = total
        sessionSteps = max(0, (total - baselineSteps).roundToInt())
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun readDailySteps(callback: (Int) -> Unit) {
        val sensor = stepCounter()
        val manager = sensorManager
        if (sensor == null || manager == null) return callback(0)
        manager.registerListener(object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                manager.unregisterListener(this)
                callback(updateDailyBaseline(event.values[0]))
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }, sensor, SensorManager.SENSOR_DELAY_FASTEST)
    }

    private fun updateDailyBaseline(total: Float): Int {
        val prefs = getSharedPreferences(STEPS_PREFS, Context.MODE_PRIVATE)
        val today = LocalDate.now().toString()
        val baseline = prefs.getFloat(KEY_BASELINE, -1f)
        if (today != prefs.getString(KEY_DAY, "") || baseline < 0) {
            prefs.edit().putString(KEY_DAY, today).putFloat(KEY_BASELINE, total).apply()
            return 0
        }
        return max(0, (total - baseline).roundToInt())
    }

    // —— SMS Retriever: 6-значный код из SMS с хешем приложения ——

    private fun startSmsRetriever() {
        SmsRetriever.getClient(this).startSmsRetriever()
            .addOnFailureListener { Log.w(TAG, "SMS Retriever start failed", it) }
        if (smsReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
                val extras = intent.extras ?: return
                @Suppress("DEPRECATION")
                val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
                if (status.statusCode != CommonStatusCodes.SUCCESS) return
                val message = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE) ?: return
                CODE_PATTERN.find(message)?.groupValues?.get(1)?.let { code -> runOnUiThread { smsSink?.success(code) } }
            }
        }
        ContextCompat.registerReceiver(
            this,
            receiver,
            IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
            SmsRetriever.SEND_PERMISSION,
            null,
            ContextCompat.RECEIVER_EXPORTED,
        )
        smsReceiver = receiver
    }

    private fun stopSmsRetriever() {
        smsReceiver?.let { runCatching { unregisterReceiver(it) } }
        smsReceiver = null
    }

    private fun createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(PUSH_CHANNEL_ID, "Уведомления RunBonus", NotificationManager.IMPORTANCE_HIGH)
        channel.description = "Заказы, награды и челленджи"
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "RunBonusSms"
        private const val STEPS_PREFS = "runbonus_daily_steps"
        private const val KEY_DAY = "day"
        private const val KEY_BASELINE = "baseline"
        const val PUSH_CHANNEL_ID = "runbonus_default"
        private val CODE_PATTERN = Regex("(?:\\D|^)(\\d{6})(?:\\D|$)")
    }
}
