"""與 SuiLa-ESP/suila/weight_logic.cpp 對應的驗證用複本。

用來在沒有燒錄板子時確認判斷規則；若韌體門檻有改，請同步此檔。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto


NOISE_G = 3.0
LIFT_DROP_G = 40.0
EMPTY_MAX_G = 100.0
MIN_INTAKE_G = 5.0
MAX_INTAKE_G = 500.0
UNREASONABLE_G = 800.0
STABLE_NEED = 8


class State(Enum):
    NEED_CALIBRATION = auto()
    WAIT_BASELINE = auto()
    READY = auto()
    LIFTED = auto()
    SETTLING = auto()
    NEED_REBUILD = auto()
    SENSOR_ERROR = auto()


class Event(Enum):
    NONE = auto()
    INTAKE = auto()
    REFILL = auto()
    BASELINE_SET = auto()
    NEED_REBUILD = auto()
    SENSOR_ERROR = auto()


@dataclass
class Outcome:
    type: Event = Event.NONE
    grams: float = 0.0
    intake_ml: float = 0.0


class WeightLogic:
    def __init__(self) -> None:
        self.state = State.NEED_CALIBRATION
        self.baseline = 0.0
        self.stable_sum = 0.0
        self.last_stable = 0.0
        self.stable_count = 0
        self.change_logged = False

    def mark_calibrated(self) -> None:
        self.state = State.WAIT_BASELINE
        self.baseline = 0.0
        self._clear()
        self.change_logged = False

    def _clear(self) -> None:
        self.stable_sum = 0.0
        self.stable_count = 0

    def _stable(self, grams: float) -> bool:
        if self.stable_count == 0:
            self.stable_sum = grams
            self.stable_count = 1
            self.last_stable = grams
            return False
        if abs(grams - self.last_stable) > NOISE_G:
            self._clear()
            self.stable_sum = grams
            self.stable_count = 1
            self.last_stable = grams
            return False
        self.stable_sum += grams
        self.stable_count += 1
        self.last_stable = grams
        return self.stable_count >= STABLE_NEED

    def update(self, grams: float, sample_ok: bool = True) -> Outcome:
        ev = Outcome()
        if not sample_ok:
            self.state = State.SENSOR_ERROR
            ev.type = Event.SENSOR_ERROR
            self._clear()
            return ev
        if self.state in (State.NEED_CALIBRATION, State.SENSOR_ERROR, State.NEED_REBUILD):
            return ev

        if self.state == State.WAIT_BASELINE:
            if self._stable(grams):
                self.baseline = self.stable_sum / self.stable_count
                self._clear()
                self.state = State.READY
                self.change_logged = False
                ev.type = Event.BASELINE_SET
                ev.grams = self.baseline
            return ev

        if self.state == State.READY:
            if grams < self.baseline - LIFT_DROP_G and grams <= EMPTY_MAX_G:
                self.state = State.LIFTED
                self._clear()
                self.change_logged = False
                return ev
            if abs(grams - self.baseline) <= NOISE_G:
                return ev
            if self._stable(grams):
                stable = self.stable_sum / self.stable_count
                self._clear()
                delta = stable - self.baseline
                if abs(delta) <= NOISE_G:
                    return ev
                if MIN_INTAKE_G <= delta <= MAX_INTAKE_G:
                    self.baseline = stable
                    ev.type = Event.REFILL
                    ev.grams = delta
                    return ev
                if delta > MAX_INTAKE_G or abs(delta) > UNREASONABLE_G:
                    self.state = State.NEED_REBUILD
                    ev.type = Event.NEED_REBUILD
                    return ev
                if delta < -MIN_INTAKE_G and abs(delta) <= MAX_INTAKE_G:
                    self.state = State.NEED_REBUILD
                    ev.type = Event.NEED_REBUILD
                    return ev
            return ev

        if self.state == State.LIFTED:
            if grams > EMPTY_MAX_G:
                self.state = State.SETTLING
                self._clear()
                self.change_logged = False
            return ev

        if self.state == State.SETTLING:
            if grams <= EMPTY_MAX_G:
                self.state = State.LIFTED
                self._clear()
                self.change_logged = False
                return ev
            if not self._stable(grams):
                return ev
            stable = self.stable_sum / self.stable_count
            self._clear()
            delta = self.baseline - stable
            if abs(delta) <= NOISE_G:
                self.state = State.READY
                return ev
            if MIN_INTAKE_G <= delta <= MAX_INTAKE_G:
                if not self.change_logged:
                    self.change_logged = True
                    ev.type = Event.INTAKE
                    ev.grams = delta
                    ev.intake_ml = delta
                    self.baseline = stable
                self.state = State.READY
                return ev
            if delta < -MIN_INTAKE_G and abs(delta) <= MAX_INTAKE_G:
                if not self.change_logged:
                    self.change_logged = True
                    ev.type = Event.REFILL
                    ev.grams = -delta
                    self.baseline = stable
                self.state = State.READY
                return ev
            self.state = State.NEED_REBUILD
            ev.type = Event.NEED_REBUILD
            return ev
        return ev


def feed(logic: WeightLogic, grams: float, times: int = STABLE_NEED) -> list[Outcome]:
    return [logic.update(grams) for _ in range(times)]


def test_800_to_750_once():
    logic = WeightLogic()
    logic.mark_calibrated()
    outs = feed(logic, 800)
    assert any(o.type == Event.BASELINE_SET for o in outs)
    assert logic.state == State.READY

    # 拿起
    assert logic.update(20).type == Event.NONE
    assert logic.state == State.LIFTED

    # 放回 750（含 LIFTED→SETTLING 一次，再穩定 STABLE_NEED 次）
    outs = feed(logic, 750, times=STABLE_NEED + 1)
    intakes = [o for o in outs if o.type == Event.INTAKE]
    assert len(intakes) == 1
    assert abs(intakes[0].intake_ml - 50) < 0.1

    # 同一變化不再記
    outs = feed(logic, 750, times=STABLE_NEED + 1)
    assert all(o.type == Event.NONE for o in outs)


def test_noise_ignored():
    logic = WeightLogic()
    logic.mark_calibrated()
    feed(logic, 800)
    for _ in range(20):
        assert logic.update(801).type == Event.NONE
        assert logic.update(799).type == Event.NONE


def test_refill_updates_baseline():
    logic = WeightLogic()
    logic.mark_calibrated()
    feed(logic, 700)
    outs = feed(logic, 850)
    assert any(o.type == Event.REFILL for o in outs)
    assert abs(logic.baseline - 850) < 0.1


def test_sensor_error():
    logic = WeightLogic()
    logic.mark_calibrated()
    ev = logic.update(100, sample_ok=False)
    assert ev.type == Event.SENSOR_ERROR
    assert logic.state == State.SENSOR_ERROR
