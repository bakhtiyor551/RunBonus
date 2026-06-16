package com.runbonus.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.time.LocalDate;

@CapacitorPlugin(
    name = "WorkoutTracking",
    permissions = {
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity")
    }
)
public class WorkoutTrackingPlugin extends Plugin implements SensorEventListener {
    private static final String PREFS = "runbonus_daily_steps";
    private static final String KEY_DAY = "day";
    private static final String KEY_BASELINE = "baseline";

    private SensorManager sensorManager;
    private Sensor stepSensor;
    private float baselineSteps = -1f;
    private int sessionSteps = 0;
    private boolean listening = false;
    private PluginCall pendingDailyStepsCall = null;

    @PluginMethod
    public void startSession(PluginCall call) {
        if (getPermissionState("activity") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "startAfterPermission");
            return;
        }
        startAfterPermission(call);
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        if (getPermissionState("activity") != com.getcapacitor.PermissionState.GRANTED) {
            call.resolve(new JSObject());
            return;
        }

        Intent serviceIntent = new Intent(getContext(), WorkoutForegroundService.class);
        String title = call.getString("title", "RunBonus — тренировка");
        serviceIntent.putExtra(WorkoutForegroundService.EXTRA_TITLE, title);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }

        startStepListener();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        stopStepListener();
        Intent serviceIntent = new Intent(getContext(), WorkoutForegroundService.class);
        getContext().stopService(serviceIntent);
        baselineSteps = -1f;
        sessionSteps = 0;
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getSteps(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("steps", sessionSteps);
        call.resolve(ret);
    }

    @PluginMethod
    public void getDailySteps(PluginCall call) {
        if (getPermissionState("activity") != com.getcapacitor.PermissionState.GRANTED) {
            pendingDailyStepsCall = call;
            requestPermissionForAlias("activity", call, "dailyStepsAfterPermission");
            return;
        }
        resolveDailySteps(call);
    }

    @PermissionCallback
    private void dailyStepsAfterPermission(PluginCall call) {
        PluginCall pending = pendingDailyStepsCall != null ? pendingDailyStepsCall : call;
        pendingDailyStepsCall = null;
        if (getPermissionState("activity") != com.getcapacitor.PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("steps", 0);
            pending.resolve(ret);
            return;
        }
        resolveDailySteps(pending);
    }

    @PluginMethod
    public void startLiveActivity(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("enabled", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateLiveActivity(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void endLiveActivity(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private void resolveDailySteps(PluginCall call) {
        SensorManager manager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        Sensor counter = manager != null ? manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) : null;
        if (manager == null || counter == null) {
            JSObject ret = new JSObject();
            ret.put("steps", 0);
            call.resolve(ret);
            return;
        }

        manager.registerListener(new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                manager.unregisterListener(this);
                float total = event.values[0];
                int daily = updateDailyBaseline(total);
                JSObject ret = new JSObject();
                ret.put("steps", daily);
                call.resolve(ret);
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {
                /* no-op */
            }
        }, counter, SensorManager.SENSOR_DELAY_FASTEST);
    }

    private int updateDailyBaseline(float totalSteps) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = LocalDate.now().toString();
        String savedDay = prefs.getString(KEY_DAY, "");
        float baseline = prefs.getFloat(KEY_BASELINE, -1f);

        if (!today.equals(savedDay) || baseline < 0) {
            baseline = totalSteps;
            prefs.edit().putString(KEY_DAY, today).putFloat(KEY_BASELINE, baseline).apply();
            return 0;
        }

        return Math.max(0, Math.round(totalSteps - baseline));
    }

    private void startStepListener() {
        if (listening) return;
        sensorManager = (SensorManager) getContext().getSystemService(android.content.Context.SENSOR_SERVICE);
        if (sensorManager == null) return;
        stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (stepSensor == null) return;
        baselineSteps = -1f;
        sessionSteps = 0;
        sensorManager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_NORMAL);
        listening = true;
    }

    private void stopStepListener() {
        if (!listening || sensorManager == null) return;
        sensorManager.unregisterListener(this);
        listening = false;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
        float total = event.values[0];
        if (baselineSteps < 0) {
            baselineSteps = total;
        }
        sessionSteps = Math.max(0, Math.round(total - baselineSteps));
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        /* no-op */
    }
}
