#include "weight_logic.h"

#include "config.h"

void WeightLogic::resetForCalibrationMissing() {
  state_ = WeightState::NeedCalibration;
  baseline_ = 0.0f;
  clearStable();
  changeLogged_ = false;
}

void WeightLogic::markCalibrated() {
  state_ = WeightState::WaitBaseline;
  baseline_ = 0.0f;
  clearStable();
  changeLogged_ = false;
}

void WeightLogic::requestRebuild() {
  state_ = WeightState::WaitBaseline;
  baseline_ = 0.0f;
  clearStable();
  changeLogged_ = false;
}

void WeightLogic::syncBaseline(float grams) {
  baseline_ = grams;
  state_ = WeightState::Ready;
  clearStable();
  changeLogged_ = false;
}

void WeightLogic::setSensorError(bool error) {
  if (error) {
    state_ = WeightState::SensorError;
    clearStable();
  }
}

void WeightLogic::clearStable() {
  stableSum_ = 0.0f;
  stableCount_ = 0;
}

bool WeightLogic::isStable(float grams) {
  if (stableCount_ == 0) {
    stableSum_ = grams;
    stableCount_ = 1;
    lastStable_ = grams;
    return false;
  }
  if (fabsf(grams - lastStable_) > NOISE_G) {
    clearStable();
    stableSum_ = grams;
    stableCount_ = 1;
    lastStable_ = grams;
    return false;
  }
  stableSum_ += grams;
  stableCount_ += 1;
  lastStable_ = grams;
  return stableCount_ >= STABLE_NEED;
}

float stableAvg(float sum, int count) { return sum / static_cast<float>(count); }

const char *WeightLogic::stateName() const {
  switch (state_) {
    case WeightState::NeedCalibration:
      return "need_calibration";
    case WeightState::WaitBaseline:
      return "wait_baseline";
    case WeightState::Ready:
      return "ready";
    case WeightState::Lifted:
      return "lifted";
    case WeightState::Settling:
      return "settling";
    case WeightState::NeedRebuild:
      return "need_rebuild";
    case WeightState::SensorError:
      return "sensor_error";
  }
  return "unknown";
}

WeightEvent WeightLogic::update(float grams, bool sampleOk) {
  WeightEvent ev;
  if (!sampleOk) {
    if (state_ != WeightState::SensorError) {
      state_ = WeightState::SensorError;
      clearStable();
      ev.type = WeightEventType::SensorError;
    }
    return ev;
  }
  if (state_ == WeightState::SensorError) {
    state_ = WeightState::WaitBaseline;
    clearStable();
  }
  if (state_ == WeightState::NeedCalibration) {
    return ev;
  }
  if (state_ == WeightState::NeedRebuild) {
    return ev;
  }

  if (state_ == WeightState::WaitBaseline) {
    if (isStable(grams)) {
      baseline_ = stableAvg(stableSum_, stableCount_);
      clearStable();
      state_ = WeightState::Ready;
      changeLogged_ = false;
      ev.type = WeightEventType::BaselineSet;
      ev.grams = baseline_;
    }
    return ev;
  }

  if (state_ == WeightState::Ready) {
    if (grams < baseline_ - LIFT_DROP_G && grams <= EMPTY_MAX_G) {
      state_ = WeightState::Lifted;
      clearStable();
      changeLogged_ = false;
      return ev;
    }
    if (fabsf(grams - baseline_) <= NOISE_G) {
      return ev;
    }
    if (isStable(grams)) {
      float stable = stableAvg(stableSum_, stableCount_);
      clearStable();
      float delta = stable - baseline_;
      if (fabsf(delta) <= NOISE_G) {
        return ev;
      }
      if (delta >= MIN_INTAKE_G && delta <= MAX_INTAKE_G) {
        baseline_ = stable;
        ev.type = WeightEventType::Refill;
        ev.grams = delta;
        return ev;
      }
      if (delta > MAX_INTAKE_G || fabsf(delta) > UNREASONABLE_G) {
        state_ = WeightState::NeedRebuild;
        ev.type = WeightEventType::NeedRebuild;
        return ev;
      }
      if (delta < -MIN_INTAKE_G && fabsf(delta) <= MAX_INTAKE_G) {
        // 未拿起就減重：視為不合理，要求重建
        state_ = WeightState::NeedRebuild;
        ev.type = WeightEventType::NeedRebuild;
        return ev;
      }
    }
    return ev;
  }

  if (state_ == WeightState::Lifted) {
    if (grams > EMPTY_MAX_G) {
      state_ = WeightState::Settling;
      clearStable();
      changeLogged_ = false;
    }
    return ev;
  }

  if (state_ == WeightState::Settling) {
    if (grams <= EMPTY_MAX_G) {
      state_ = WeightState::Lifted;
      clearStable();
      changeLogged_ = false;
      return ev;
    }
    if (!isStable(grams)) {
      return ev;
    }
    float stable = stableAvg(stableSum_, stableCount_);
    clearStable();
    float delta = baseline_ - stable;
    if (fabsf(delta) <= NOISE_G) {
      state_ = WeightState::Ready;
      return ev;
    }
    if (delta >= MIN_INTAKE_G && delta <= MAX_INTAKE_G) {
      if (!changeLogged_) {
        changeLogged_ = true;
        ev.type = WeightEventType::Intake;
        ev.grams = delta;
        ev.intakeMl = delta;  // 1g ≈ 1mL
        baseline_ = stable;
      }
      state_ = WeightState::Ready;
      return ev;
    }
    if (delta < -MIN_INTAKE_G && fabsf(delta) <= MAX_INTAKE_G) {
      // 放回後變重：補水
      if (!changeLogged_) {
        changeLogged_ = true;
        ev.type = WeightEventType::Refill;
        ev.grams = -delta;
        baseline_ = stable;
      }
      state_ = WeightState::Ready;
      return ev;
    }
    state_ = WeightState::NeedRebuild;
    ev.type = WeightEventType::NeedRebuild;
    return ev;
  }

  return ev;
}
