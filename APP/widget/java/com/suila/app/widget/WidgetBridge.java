package com.suila.app.widget;

import android.content.Context;
import android.webkit.JavascriptInterface;

/** Lets the open app hand today's water to the home-screen widget. */
public class WidgetBridge {
    private final Context context;

    public WidgetBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public void publish(String amount, String goal) {
        WaterWidget.publish(context, amount, goal == null ? "" : goal);
    }
}
