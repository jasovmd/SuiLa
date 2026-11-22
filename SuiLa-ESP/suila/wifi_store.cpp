#include "wifi_store.h"

#include <Preferences.h>

static Preferences prefs;
static String ssid;
static String pass;
static bool ready = false;

void wifiStoreBegin() {
  prefs.begin("suila_wifi", true);
  ssid = prefs.getString("ssid", "");
  pass = prefs.getString("pass", "");
  prefs.end();
  ready = ssid.length() > 0;
}

bool wifiHasCredentials() { return ready; }

String wifiGetSsid() { return ssid; }

String wifiGetPass() { return pass; }

void wifiSaveCredentials(const String &newSsid, const String &newPass) {
  ssid = newSsid;
  pass = newPass;
  ready = ssid.length() > 0;
  prefs.begin("suila_wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
}

void wifiClearCredentials() {
  ssid = "";
  pass = "";
  ready = false;
  prefs.begin("suila_wifi", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
}
