#include "event_queue.h"

void EventQueue::begin() {
  prefs_.begin("suila", false);
  load();
}

void EventQueue::load() {
  count_ = prefs_.getInt("qcount", 0);
  if (count_ < 0 || count_ > CAP) {
    count_ = 0;
  }
  for (int i = 0; i < count_; i++) {
    String key = "q" + String(i);
    String line = prefs_.getString(key.c_str(), "");
    items_[i].used = false;
    if (line.length() == 0) {
      continue;
    }
    // event_id|measured_at|ml|verified
    int p1 = line.indexOf('|');
    int p2 = line.indexOf('|', p1 + 1);
    int p3 = line.indexOf('|', p2 + 1);
    if (p1 < 0 || p2 < 0 || p3 < 0) {
      continue;
    }
    String id = line.substring(0, p1);
    String at = line.substring(p1 + 1, p2);
    int ml = line.substring(p2 + 1, p3).toInt();
    int verified = line.substring(p3 + 1).toInt();
    id.toCharArray(items_[i].event_id, sizeof(items_[i].event_id));
    at.toCharArray(items_[i].measured_at, sizeof(items_[i].measured_at));
    items_[i].intake_ml = ml;
    items_[i].time_verified = verified != 0;
    items_[i].used = true;
  }
}

void EventQueue::save() {
  prefs_.putInt("qcount", count_);
  for (int i = 0; i < CAP; i++) {
    String key = "q" + String(i);
    if (i < count_ && items_[i].used) {
      String line = String(items_[i].event_id) + "|" + String(items_[i].measured_at) + "|" +
                    String(items_[i].intake_ml) + "|" + String(items_[i].time_verified ? 1 : 0);
      prefs_.putString(key.c_str(), line);
    } else {
      prefs_.remove(key.c_str());
    }
  }
}

bool EventQueue::enqueue(const char *event_id, const char *measured_at, int intake_ml,
                         bool time_verified) {
  if (count_ >= CAP) {
    return false;
  }
  PendingEvent &item = items_[count_];
  strncpy(item.event_id, event_id, sizeof(item.event_id) - 1);
  item.event_id[sizeof(item.event_id) - 1] = 0;
  strncpy(item.measured_at, measured_at, sizeof(item.measured_at) - 1);
  item.measured_at[sizeof(item.measured_at) - 1] = 0;
  item.intake_ml = intake_ml;
  item.time_verified = time_verified;
  item.used = true;
  count_ += 1;
  save();
  return true;
}

bool EventQueue::peek(PendingEvent &out) const {
  if (count_ <= 0 || !items_[0].used) {
    return false;
  }
  out = items_[0];
  return true;
}

void EventQueue::pop() {
  if (count_ <= 0) {
    return;
  }
  for (int i = 1; i < count_; i++) {
    items_[i - 1] = items_[i];
  }
  count_ -= 1;
  if (count_ >= 0) {
    items_[count_].used = false;
  }
  save();
}

int EventQueue::size() const { return count_; }
