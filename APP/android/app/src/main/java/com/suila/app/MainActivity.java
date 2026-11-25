package com.suila.app;

import com.getcapacitor.BridgeActivity;
import com.suila.app.widget.WidgetBridge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().addJavascriptInterface(new WidgetBridge(this), "SuilaWidget");
    }
}
