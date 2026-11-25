#pragma once

#include <Arduino.h>

enum class WeightState : uint8_t {
  NeedCalibration = 0,
  WaitBaseline,
  Ready,
  Lifted,
  Settling,
  NeedRebuild,
  SensorError
};

enum class WeightEventType : uint8_t {
  None = 0,
  Intake,
  Refill,
  BaselineSet,
  NeedRebuild,
  SensorError
};

struct WeightEvent {
  WeightEventType type = WeightEventType::None;
  float grams = 0.0f;
  float intakeMl = 0.0f;
};

class WeightLogic {
 public:
  void resetForCalibrationMissing();
  void markCalibrated();
  void requestRebuild();
  void setSensorError(bool error);
  /** APP 模擬改重量：同步基準，不產生飲水事件（避免與 APP 重複計次） */
  void syncBaseline(float grams);
  WeightEvent update(float grams, bool sampleOk);

  WeightState state() const { return state_; }
  float baseline() const { return baseline_; }
  bool baselineReady() const {
    return state_ == WeightState::Ready || state_ == WeightState::Lifted ||
           state_ == WeightState::Settling;
  }
  const char *stateName() const;

 private:
  bool isStable(float grams);
  void clearStable();

  WeightState state_ = WeightState::NeedCalibration;
  float baseline_ = 0.0f;
  float stableSum_ = 0.0f;
  float lastStable_ = 0.0f;
  int stableCount_ = 0;
  bool changeLogged_ = false;
};
