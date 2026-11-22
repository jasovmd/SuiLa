#pragma once

#include <Arduino.h>

#include "config.h"

#if !SUILA_USE_SIM
#include <HX711.h>
#endif

class WeightSensor {
 public:
  bool begin();
  bool readGrams(float &outGrams);
  bool tare();
  bool calibrateWithKnownGrams(float knownGrams);
  bool calibrated() const { return calibrated_; }
  bool sensorOk() const { return sensorOk_; }
  float scale() const { return scale_; }
  void setSimGrams(float grams);
  float simGrams() const { return simGrams_; }
  bool loadCalibration();
  void saveCalibration();

 private:
#if !SUILA_USE_SIM
  HX711 hx_;
#endif
  bool sensorOk_ = false;
  bool calibrated_ = false;
  float scale_ = 1.0f;
  long offset_ = 0;
  float simGrams_ = 800.0f;
};
