#pragma once

#include <Arduino.h>

typedef void (*ProvWifiApplyFn)(const String &ssid, const String &pass);
typedef void (*ProvWifiClearFn)();
typedef bool (*ProvWifiBusyFn)();

void bleProvBegin(const char *advertiseName);
void bleProvLoop();
bool bleProvConnected();
void bleProvSetHandlers(ProvWifiApplyFn onApply, ProvWifiClearFn onClear, ProvWifiBusyFn isBusy);
void bleProvNotifyWifiResult(bool ok, const String &detail);
