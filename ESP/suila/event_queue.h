#pragma once

#include <Arduino.h>
#include <Preferences.h>

struct PendingEvent {
  char event_id[40];
  char measured_at[32];
  int intake_ml;
  bool time_verified;
  bool used;
};

class EventQueue {
 public:
  void begin();
  bool enqueue(const char *event_id, const char *measured_at, int intake_ml, bool time_verified);
  bool peek(PendingEvent &out) const;
  void pop();
  int size() const;
  void save();

 private:
  static const int CAP = 20;
  PendingEvent items_[CAP];
  int count_ = 0;
  Preferences prefs_;
  void load();
};
