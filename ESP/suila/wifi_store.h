#pragma once

#include <Arduino.h>

void wifiStoreBegin();
bool wifiHasCredentials();
String wifiGetSsid();
String wifiGetPass();
void wifiSaveCredentials(const String &ssid, const String &pass);
void wifiClearCredentials();
