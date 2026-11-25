package com.suila.app.widget;

import com.suila.app.MainActivity;
import com.suila.app.R;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Home-screen cup. The open app writes today's water via {@link WidgetBridge};
 * this provider only shows the saved numbers on a timer.
 */
public class WaterWidget extends AppWidgetProvider {
    static final String REFRESH = "com.suila.app.WIDGET_REFRESH";
    private static final String PREFS = "suila_widget";
    private static final long EVERY_MS = 15 * 60 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context app = context.getApplicationContext();
        final String action = intent == null ? "" : intent.getAction();
        if (AppWidgetManager.ACTION_APPWIDGET_DISABLED.equals(action)) {
            onDisabled(app);
            return;
        }
        showSaved(app);
        schedule(app);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        showSaved(context.getApplicationContext());
        schedule(context.getApplicationContext());
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(pending(context));
    }

    /** The open app already reached the server, so the home widget can show that result. */
    public static void publish(Context context, String amount, String goal) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("amount", amount)
            .putString("goal", goal == null ? "" : goal)
            .apply();
        show(context, amount, goal == null ? "" : goal);
    }

    private static void showSaved(Context app) {
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String amount = prefs.getString("amount", app.getString(R.string.widget_loading));
        String goal = prefs.getString("goal", "");
        show(app, amount, goal);
    }

    private static void show(Context context, String amount, String goal) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WaterWidget.class));
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_water);
            views.setTextViewText(R.id.widget_amount, amount);
            views.setTextViewText(R.id.widget_goal, goal);
            Intent open = new Intent(context, MainActivity.class);
            PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pending);
            manager.updateAppWidget(id, views);
        }
    }

    private static void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        try {
            long next = System.currentTimeMillis() + EVERY_MS;
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending(context));
        } catch (SecurityException ignored) {
            // The 30-minute widget update still runs if the alarm is not allowed.
        }
    }

    private static PendingIntent pending(Context context) {
        Intent intent = new Intent(context, WaterWidget.class);
        intent.setAction(REFRESH);
        return PendingIntent.getBroadcast(
            context,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
