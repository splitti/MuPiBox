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
    # the time constant of the current the time until full is worked out with in the CC phase, in seconds: the box takes
    # part of what the input gives (a playing amplifier, the display), so the charge current goes up and down by the
    # minute - with the current of the last minute the time jumped between 6 and 15 hours
    ETA_SMOOTHING_S = 900
    # how long a quiet stretch of the pack is remembered as the starting point, in seconds
    REST_WINDOW_S = 600
    # after a charge the voltage reads too high for a while (the pack settles): this long the starting point of a new charge
    # is what the last one reached, less what the box took from the pack since
    RELAX_S = 1800
    # more than this many hours is no estimate
    MAX_ETA_H = 24
    # the constant-voltage phase counts when the voltage is within this of the charge limit, for this many readings in a row
    CV_NEAR_LIMIT_MV = 250
    # the end of a charge (Done, Top-off) only this close to the limit: on a weak 5 V input the chip reported "Done" again and
    # again at 8.0-8.17 V of 8.30, whenever the box took more and the charge current broke down for a moment - at 80 %
    END_NEAR_LIMIT_MV = 100
    CV_CONFIRM_READINGS = 3
    # A real end comes on a weak input straight out of the CC phase (no CV), and the pack then drops at once to 8.14-8.17 V
    # of 8.30: the voltage of the Done is no measure then, so it also counts when the charge was near the limit this short
    # a time before - or when the chip holds the Done this long and the pack stays above its recharge level. Near the end
    # the chip goes back and forth between CC and Done for a minute or two at a time: the Done after the near limit counts
    # only when it stays END_CONFIRM_S
    END_RECENT_S = 600
    END_CONFIRM_S = 300
    END_HOLD_S = 1800
    END_HOLD_NEAR_MV = 200

    def __init__(self, capacity_mah=None, iterm_ma=200, clock=time.monotonic, wall=time.time, state_file=None):
        self.capacity = capacity_mah if capacity_mah and capacity_mah > 0 else None
        self.iterm = max(50, iterm_ma or 200)
        self._clock = clock
        self._wall = wall
        self._state_file = state_file
        self._rest = deque()  # (t, percent by voltage) while not charging
        self._last_t = None
        self._cv_streak = 0
        self._end_streak = 0
        self._near_end_t = None  # when the pack was last near the limit while it charged
        self._done_since = None  # since when the chip reports the end without a break
        self._after = None  # [time the last charge ended, percent it reached, mAh taken from the pack since]
        self.reset_session()
        self._restore()

    # --- what the user of this class reads
    percent = None  # the estimate while charging (float), else None
    settling = False  # True: no charge, but shortly after one - percent is then what it reached less what was used
    eta_min = None  # minutes until full, else None
    phase = "idle"

    def reset_session(self):
        self.active = False
        self.full = False  # True: the chip ended this charge once (a top-up after it stays at 100 %)
        self.start_uncertain = False  # True: the starting point is only the voltage (nothing known from before the charge)
        self.start_pct = 0.0
        self.charged_mah = 0.0
        self.ema = None
        self.slow = None
        self.cc_peak = 0.0
        self.cv_i0 = None
        self._cv = deque()  # (t, ln(I)) in the CV phase
        self.percent = None
        self.eta_min = None

    def set_capacity(self, capacity_mah):
        self.capacity = capacity_mah if capacity_mah and capacity_mah > 0 else None

    # --- feeding
    def update(self, ibat_ma, status, voltage_pct, vbat_mv=None, vreg_mv=None):
        """One reading (every few seconds): battery current in mA (+ = charging), the chip's charge state, and the percent
        the voltage alone says (a float, with the voltage drop of the charge current taken off). With the battery voltage
        and the charge limit (VREG) the constant-voltage phase is told from a false report of it."""
        now = self._clock()
        dt = 0.0 if self._last_t is None else min(30.0, max(0.0, now - self._last_t))
        self._last_t = now
        ph = phase_of(status)
        # The chip reports "Taper (CV mode)" for a moment now and then while it is still far from its charge limit (when
        # the input gives way, at a change of the cable ...). The CV phase is only taken for real when the voltage is near
        # the limit and the report stays for a few readings - a single wrong one set the percent to 99 for good.
        if ph == "cv":
            near_limit = vbat_mv is None or vreg_mv is None or vbat_mv >= vreg_mv - self.CV_NEAR_LIMIT_MV
            self._cv_streak = self._cv_streak + 1 if near_limit else 0
            if self._cv_streak < self.CV_CONFIRM_READINGS:
                ph = "cc"
        else:
            self._cv_streak = 0
        # The same for the end of a charge ("Top-off", "Charge Termination Done"): after a failed read of the chip
        # (I2C error) one of them came now and then in the middle of the constant-current phase, and as the percent never
        # goes back within a charge, it stayed at 99 % from 50 % on. Taken only near the charge limit and when it stays;
        # until then the reading is left out (the percent and the time stay as they were).
        if ph in ("topoff", "done"):
            if self._done_since is None:
                self._done_since = now
            near_limit = vbat_mv is None or vreg_mv is None or vbat_mv >= vreg_mv - self.END_NEAR_LIMIT_MV
            recent = (self._near_end_t is not None and self._done_since - self._near_end_t <= self.END_RECENT_S
                      and now - self._done_since >= self.END_CONFIRM_S)
            held = now - self._done_since >= self.END_HOLD_S and vbat_mv is not None and vreg_mv is not None and vbat_mv >= vreg_mv - self.END_HOLD_NEAR_MV
            self._end_streak = self._end_streak + 1 if (near_limit or recent or held) else 0
            if self._end_streak < self.CV_CONFIRM_READINGS:
                return
        else:
            self._end_streak = 0
            self._done_since = None
            if (ph in CHARGING_PHASES and ibat_ma is not None and ibat_ma > self.MIN_CHARGE_MA and vbat_mv is not None
                    and vreg_mv is not None and vbat_mv >= vreg_mv - self.END_NEAR_LIMIT_MV):
                self._near_end_t = now
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
                    self._after = [now, float(last), 0.0]
                self._save()
            if self._after is not None:
                if now - self._after[0] <= self.RELAX_S:
                    self._after[2] += max(-(ibat_ma or 0.0), 0.0) * dt / 3600.0
                else:
                    self._after = None
            if voltage_pct is not None:
                self._rest.append((now, float(voltage_pct)))
            while self._rest and now - self._rest[0][0] > self.REST_WINDOW_S:
                self._rest.popleft()
            self.eta_min = None
            # shortly after a charge (cable out) the voltage still reads the charge - it showed 90 % at 80: what the
            # charge reached, less what the box used since, until the pack has settled
            if self._after is not None:
                used = self._after[2] / self.capacity * 100.0 if self.capacity else 0.0
                self.percent = max(0.0, self._after[1] - used)
                self.settling = True
            else:
                self.percent = None
                self.settling = False
            return

        self.settling = False
        if self.full and ph != "done":
            # the chip charges again after the end (the pack sank a little, or the box took more for a moment): still full
            self.phase = "done"
            self.percent = 100.0
            self.eta_min = None
            return
        if ph == "done":
            self.percent = 100.0
            self.eta_min = 0
            self.active = True
            self.full = True
            self.start_uncertain = False
            self._save()
            return

        if not self.active:
            self.active = True
            self.start_pct, known = self._starting_point(now, voltage_pct)
            self.start_uncertain = not known
            self.charged_mah = 0.0
            self.ema = None
            self.slow = None
            self.cc_peak = 0.0
            self.cv_i0 = None
            self._cv.clear()
            self.percent = self.start_pct

        i = float(ibat_ma)
        self.ema = i if self.ema is None else self.ema + (i - self.ema) * min(1.0, dt / self.CURRENT_SMOOTHING_S if dt else 1.0)
        self.slow = i if self.slow is None else self.slow + (i - self.slow) * min(1.0, dt / self.ETA_SMOOTHING_S if dt else 1.0)
        self.charged_mah += max(i, 0.0) * dt / 3600.0 * self.EFFICIENCY

        pct = self.start_pct + (self.charged_mah / self.capacity * 100.0 if self.capacity else 0.0)
        if ph == "cc":
            self.cc_peak = max(self.cc_peak, self.ema)
            pct = min(pct, self.CC_END_PCT)
        elif ph == "cv":
            if self.cv_i0 is None:
                # the step over to CV is a known point: take the count to it
                self.cv_i0 = max(i, self.iterm * 1.5)
                # a start that was only a guess from the voltage (too high while it charges) is corrected here, downwards
                # too - once; the note on it goes only with the correction
                if self.start_uncertain:
                    self.percent = None
                self.start_uncertain = False
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
        # (from 99 % on no time any more: the pack is as good as full - on a weak input the chip stays in CC at the
        # charge limit with the current the input leaves, and the fall of that current, which the time goes by, does
        # not come; it said "full in about 6 h 20 min" at 8.30 V and 100 %)
        self.eta_min = None if self.percent >= 99.0 else self._eta(ph)
        self._save()

    # --- parts
    def _starting_point(self, now, voltage_pct):
        """The percent before the charge: the middle of what the voltage said while the pack was at rest - or, shortly after
        a charge (cable out for a moment), what that one reached less what was used since: the voltage then still reads
        the charge (it jumped from 70 to 80 % after five minutes without the cable)."""
        if self._after is not None and now - self._after[0] <= self.RELAX_S:
            used = self._after[2] / self.capacity * 100.0 if self.capacity else 0.0
            return max(0.0, self._after[1] - used), True
        old = sorted(p for (t, p) in self._rest if now - t >= 20)
        if old:
            return old[len(old) // 2], True
        if self._rest:
            return sorted(p for (_, p) in self._rest)[len(self._rest) // 2], True
        # nothing from before the charge (the service started while it charged): only the voltage is left - a guess
        return (float(voltage_pct) if voltage_pct is not None else 0.0), False

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
        # (CC: the current of the last quarter of an hour; CV: the current now - it falls, and the fall is the measure)
        i_now = (self.slow or self.ema or 0.0) if ph == "cc" else (self.ema or 0.0)
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
            data = {"wall": self._wall(), "active": self.active, "start_pct": self.start_pct, "charged_mah": self.charged_mah, "cc_peak": self.cc_peak, "slow": self.slow, "cv_i0": self.cv_i0, "percent": self.percent, "start_uncertain": self.start_uncertain, "full": self.full}
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
                self.slow = float(data["slow"]) if data.get("slow") else None
                self.cv_i0 = data.get("cv_i0")
                self.percent = data.get("percent")
                self.start_uncertain = bool(data.get("start_uncertain", False))
                self.full = bool(data.get("full", False))
                # (the phase of the charge as well: a reading left out right after the restart - a false "Done" - would
                # else show the voltage, which reads high while it charges)
                self.phase = "done" if self.full else "cv" if self.cv_i0 else "cc"
        except (OSError, ValueError, KeyError, TypeError):
            pass
