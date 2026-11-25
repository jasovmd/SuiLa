#include "sensor.h"

#include <Preferences.h>

bool WeightSensor::begin() {
#if SUILA_USE_SIM
  sensorOk_ = true;
  calibrated_ = true;
  scale_ = 1.0f;
  offset_ = 0;
  return true;
#else
  hx_.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  sensorOk_ = false;
  for (int i = 0; i < 20; ++i) {
    if (hx_.is_ready()) {
      sensorOk_ = true;
      break;
    }
    delay(50);
  }
  if (!sensorOk_) {
    calibrated_ = false;
    return false;
  }
  loadCalibration();
  // 模擬模式存過 scale=1，不能拿來當真實校正。
  if (!calibrated_ || fabsf(scale_) < 10.0f) {
    calibrated_ = false;
    scale_ = 1.0f;
    offset_ = 0;
  }
  hx_.set_scale(scale_);
  hx_.set_offset(offset_);
  return true;
#endif
}

bool WeightSensor::readGrams(float &outGrams) {
#if SUILA_USE_SIM
  sensorOk_ = true;
  outGrams = simGrams_;
  return true;
#else
  if (!hx_.wait_ready_timeout(250)) {
    sensorOk_ = false;
    return false;
  }
  float value = hx_.get_units(3);
  if (isnan(value) || isinf(value)) {
    sensorOk_ = false;
    return false;
  }
  sensorOk_ = true;
  outGrams = value;
  return true;
#endif
}

bool WeightSensor::tare() {
#if SUILA_USE_SIM
  offset_ = 0;
  simGrams_ = 0.0f;
  calibrated_ = true;
  saveCalibration();
  return true;
#else
  if (!hx_.wait_ready_timeout(1000)) {
    sensorOk_ = false;
    return false;
  }
  hx_.tare(15);
  offset_ = hx_.get_offset();
  sensorOk_ = true;
  saveCalibration();
  return true;
#endif
}

bool WeightSensor::calibrateWithKnownGrams(float knownGrams) {
  if (knownGrams < 1.0f) {
    return false;
  }
#if SUILA_USE_SIM
  scale_ = 1.0f;
  calibrated_ = true;
  simGrams_ = knownGrams;
  saveCalibration();
  return true;
#else
  if (!hx_.wait_ready_timeout(1000)) {
    sensorOk_ = false;
    return false;
  }
  float raw = hx_.get_value(20);
  if (fabsf(raw) < 1.0f) {
    return false;
  }
  scale_ = raw / knownGrams;
  hx_.set_scale(scale_);
  calibrated_ = true;
  sensorOk_ = true;
  saveCalibration();
  return true;
#endif
}

void WeightSensor::setSimGrams(float grams) { simGrams_ = grams; }

bool WeightSensor::loadCalibration() {
  Preferences prefs;
  prefs.begin("suila_cal", true);
  calibrated_ = prefs.getBool("ok", false);
  scale_ = prefs.getFloat("scale", 1.0f);
  offset_ = prefs.getLong("offset", 0);
  prefs.end();
  return calibrated_;
}

void WeightSensor::saveCalibration() {
  Preferences prefs;
  prefs.begin("suila_cal", false);
  prefs.putBool("ok", calibrated_);
  prefs.putFloat("scale", scale_);
  prefs.putLong("offset", offset_);
  prefs.end();
}
