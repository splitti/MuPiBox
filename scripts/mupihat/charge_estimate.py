"""Percent while charging and time until the battery is full (MuPiHAT, BQ25792).

The charger holds the pack above its rest voltage while it charges, so the voltage alone reads "full" almost as soon as
the cable is plugged in. This module does what the voltage cannot:

  * the charge that went in is counted (current x time) from the percent the pack had before the cable was plugged in,
  * the step from constant current (CC) to constant voltage (CV) is a known point (about 85 %), and in the CV phase the
    current falls off until the charger ends the charge - how far it has fallen says how far the pack is,
  * the time left is the rest of the CC phase (charge still to go / the current) plus the CV tail, which follows the
    measured fall of the current (a fit of ln(I) over the last minutes) or, until that is known, a typical time constant.

It is an estimate: the capacity is the one of the profile (a pack gets smaller with age), and the box itself takes power
while it charges. No I2C in here, so it can be tried with recorded or invented values (see test_charge_estimate.py).
"""

import json
import math
import os
import time
from collections import deque

CHARGING_PHASES = ("precharge", "cc", "cv", "topoff")


def phase_of(status):
    """The charge state of the chip's text ("Fast charge (CC mode)" ...) as one of idle, precharge, cc, cv, topoff, done."""
    s = (status or "").lower()
    if not s or "not charging" in s or "reserved" in s:
        return "idle"
    if "termination" in s or "done" in s:
        return "done"
    if "top-off" in s or "top off" in s:
        return "topoff"
    if "taper" in s or "cv" in s:
        return "cv"
    if "fast" in s or "cc" in s:
        return "cc"
    if "pre" in s or "trickle" in s:
        return "precharge"
    return "idle"


class ChargeEstimator:
    # where a lithium pack goes over from constant current to constant voltage, in percent of its capacity
    CC_END_PCT = 85.0
    # share of the charge that stays in the pack
    EFFICIENCY = 0.97
    # typical time constant of the CV phase in hours per (capacity / charge current in hours); only until the fall of the
    # current has been measured
    TAU_FACTOR = 0.10
    # a current below this is not charging (noise of the ADC, the pack idling)
    MIN_CHARGE_MA = 15
    # the time constant of the smoothing of the charge current, in seconds
    CURRENT_SMOOTHING_S = 60
    # how long a quiet stretch of the pack is remembered as the starting point, in seconds
    REST_WINDOW_S = 600
    # more than this many hours is no estimate
    MAX_ETA_H = 24

    def __init__(self, capacity_mah=None, iterm_ma=200, clock=time.monotonic, wall=time.time, state_file=None):
        self.capacity = capacity_mah if capacity_mah and capacity_mah > 0 else None
        self.iterm = max(50, iterm_ma or 200)
        self._clock = clock
        self._wall = wall
        self._state_file = state_file
        self._rest = deque()  # (t, percent by voltage) while not charging
        self._last_t = None
        self.reset_session()
        self._restore()

    # --- what the user of this class reads
    percent = None  # the estimate while charging (float), else None
    eta_min = None  # minutes until full, else None
    phase = "idle"

    def reset_session(self):
        self.active = False
        self.start_pct = 0.0
        self.charged_mah = 0.0
        self.ema = None
        self.cc_peak = 0.0
        self.cv_i0 = None
        self._cv = deque()  # (t, ln(I)) in the CV phase
        self.percent = None
        self.eta_min = None

    def set_capacity(self, capacity_mah):
        self.capacity = capacity_mah if capacity_mah and capacity_mah > 0 else None

    # --- feeding
    def update(self, ibat_ma, status, voltage_pct):
        """One reading (every few seconds): battery current in mA (+ = charging), the chip's charge state, and the percent
        the voltage alone says (a float)."""
        now = self._clock()
        dt = 0.0 if self._last_t is None else min(30.0, max(0.0, now - self._last_t))
        self._last_t = now
        ph = phase_of(status)
        self.phase = ph
        charging = ph in CHARGING_PHASES and ibat_ma is not None and ibat_ma > self.MIN_CHARGE_MA

        if not charging and ph != "done":
            # at rest or discharging: the voltage is the best there is, and it is what a charge will start from
            if self.active:
                # the charge ends (cable out, or the chip stops for a moment): what was reached stays the starting point
                # of the next one - the old readings from before the charge are of no use any more
                last = self.percent
                self.reset_session()
                self._rest.clear()
                if last is not None:
                    self._rest.append((now - 25, last))
                self._save()
            if voltage_pct is not None:
                self._rest.append((now, float(voltage_pct)))
            while self._rest and now - self._rest[0][0] > self.REST_WINDOW_S:
                self._rest.popleft()
            self.percent = None
            self.eta_min = None
            return

        if ph == "done":
            self.percent = 100.0
            self.eta_min = 0
            self.active = True
            self._save()
            return

        if not self.active:
            self.active = True
            self.start_pct = self._starting_point(now, voltage_pct)
            self.charged_mah = 0.0
            self.ema = None
            self.cc_peak = 0.0
            self.cv_i0 = None
            self._cv.clear()
            self.percent = self.start_pct

        i = float(ibat_ma)
        self.ema = i if self.ema is None else self.ema + (i - self.ema) * min(1.0, dt / self.CURRENT_SMOOTHING_S if dt else 1.0)
        self.charged_mah += max(i, 0.0) * dt / 3600.0 * self.EFFICIENCY

        pct = self.start_pct + (self.charged_mah / self.capacity * 100.0 if self.capacity else 0.0)
        if ph == "cc":
            self.cc_peak = max(self.cc_peak, self.ema)
            pct = min(pct, self.CC_END_PCT)
        elif ph == "cv":
            if self.cv_i0 is None:
                # the step over to CV is a known point: take the count to it
                self.cv_i0 = max(i, self.iterm * 1.5)
                self.cc_peak = max(self.cc_peak, self.cv_i0)
                pct = self.CC_END_PCT
            span = math.log(max(self.cv_i0, self.iterm * 1.01) / self.iterm)
            fall = math.log(max(min(i, self.cv_i0), self.iterm) / self.iterm)
            pct = self.CC_END_PCT + (100.0 - self.CC_END_PCT) * (1.0 - fall / span if span > 0 else 1.0)
            self._cv.append((now, math.log(max(i, 1.0))))
            while self._cv and now - self._cv[0][0] > 600:
                self._cv.popleft()
        elif ph == "topoff":
            pct = max(pct, 97.0)
        # never backwards within a charge, never "full" before the charger says so
        pct = max(pct, self.percent or 0.0)
        self.percent = min(pct, 99.0)
        self.eta_min = self._eta(ph)
        self._save()

    # --- parts
    def _starting_point(self, now, voltage_pct):
        """The percent before the charge: the middle of what the voltage said while the pack was at rest."""
        old = sorted(p for (t, p) in self._rest if now - t >= 20)
        if old:
            return old[len(old) // 2]
        if self._rest:
            return sorted(p for (_, p) in self._rest)[len(self._rest) // 2]
        return float(voltage_pct) if voltage_pct is not None else 0.0

    def _tau_s(self):
        """Time constant of the fall of the current in the CV phase, in seconds."""
        if len(self._cv) >= 6 and self._cv[-1][0] - self._cv[0][0] >= 120:
            n = len(self._cv)
            mt = sum(t for t, _ in self._cv) / n
            my = sum(y for _, y in self._cv) / n
            den = sum((t - mt) ** 2 for t, _ in self._cv)
            slope = sum((t - mt) * (y - my) for t, y in self._cv) / den if den else 0.0
            if slope < -2e-5:
                return min(max(-1.0 / slope, 120.0), 4 * 3600.0)
        if not self.capacity:
            return None
        icc = max(self.cc_peak, self.cv_i0 or 0.0, self.iterm * 2)
        return self.TAU_FACTOR * self.capacity / icc * 3600.0

    def _eta(self, ph):
        if ph == "precharge":
            return None
        if ph == "topoff":
            return 10
        i_now = self.ema if self.ema else 0.0
        if i_now < self.MIN_CHARGE_MA * 2:
            return None  # hardly anything goes in (the box takes what the input gives): no time to name
        tau = self._tau_s()
        if tau is None:
            return None
        if ph == "cv":
            seconds = tau * math.log(max(i_now, self.iterm * 1.01) / self.iterm)
        else:  # cc
            if not self.capacity:
                return None
            to_go_mah = max(0.0, (self.CC_END_PCT - (self.percent or 0.0)) / 100.0 * self.capacity) / self.EFFICIENCY
            start_cv = max(self.cc_peak, i_now, self.iterm * 2)
            seconds = to_go_mah / i_now * 3600.0 + tau * math.log(start_cv / self.iterm)
        if seconds > self.MAX_ETA_H * 3600:
            return None
        return int(round(seconds / 60.0 / 5.0) * 5)

    # --- a restart of the service in the middle of a charge goes on where it was
    def _save(self):
        if not self._state_file:
            return
        try:
            data = {"wall": self._wall(), "active": self.active, "start_pct": self.start_pct, "charged_mah": self.charged_mah, "cc_peak": self.cc_peak, "cv_i0": self.cv_i0, "percent": self.percent}
            tmp = self._state_file + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f)
            os.replace(tmp, self._state_file)
        except OSError:
            pass

    def _restore(self):
        if not self._state_file:
            return
        try:
            with open(self._state_file) as f:
                data = json.load(f)
            if data.get("active") and self._wall() - float(data.get("wall", 0)) < 120:
                self.active = True
                self.start_pct = float(data["start_pct"])
                self.charged_mah = float(data["charged_mah"])
                self.cc_peak = float(data.get("cc_peak") or 0.0)
                self.cv_i0 = data.get("cv_i0")
                self.percent = data.get("percent")
        except (OSError, ValueError, KeyError, TypeError):
            pass
