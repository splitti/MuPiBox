"""Tries charge_estimate.py with an invented charge: a 10 Ah pack from 30 %, 2 A constant current up to 85 %, then the
current falls off (time constant 30 min) to the termination current, top-off, done. Run: python3 test_charge_estimate.py"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from charge_estimate import ChargeEstimator  # noqa: E402

CAP = 10000.0
ICC = 2000.0
ITERM = 200.0
START = 30.0
TAU_REAL = 1800.0
STEP = 5.0

clock = [0.0]
est = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])

# the pack at rest for 5 minutes (the voltage says 30 %, 40 mA of the box's own draw: discharging)
for _ in range(60):
    clock[0] += STEP
    est.update(-600, "Not Charging", START)

# the real course: when is what reached
cc_seconds = (85.0 - START) / 100.0 * CAP / ICC * 3600.0 / est.EFFICIENCY
cv_seconds = TAU_REAL * math.log(ICC / ITERM)
total = cc_seconds + cv_seconds
print(f"truth: CC {cc_seconds / 3600:.2f} h + CV {cv_seconds / 3600:.2f} h = {total / 3600:.2f} h until the charger ends it")

t0 = clock[0]
errors = []
last_pct = -1.0
checkpoints = {0.05, 0.25, 0.5, 0.75, 0.9}
shown = set()
t = 0.0
while t <= total:
    if t < cc_seconds:
        status, i, v = "Fast charge (CC mode)", ICC, START
    else:
        status = "Taper Charge (CV mode)"
        i = ICC * math.exp(-(t - cc_seconds) / TAU_REAL)
        v = 85
    clock[0] = t0 + t
    est.update(i, status, 100)  # the voltage alone reads 100 % all the time: that is the problem
    assert est.percent is not None and est.percent >= last_pct - 1e-9, "percent went backwards"
    last_pct = est.percent
    truth_min = (total - t) / 60.0
    if est.eta_min is not None and t > 600:
        errors.append((est.eta_min - truth_min) / max(truth_min, 30.0))
    frac = t / total
    for c in checkpoints:
        if frac >= c and c not in shown:
            shown.add(c)
            print(f"  at {frac * 100:3.0f} % of the way: percent {est.percent:5.1f}  eta {est.eta_min} min  (truth {truth_min:4.0f} min)  {est.phase}")
    t += STEP

# the end: the charger says done
clock[0] += STEP
est.update(0, "Charge Termination Done", 100)
print(f"done: percent {est.percent}  eta {est.eta_min}")
assert est.percent == 100.0 and est.eta_min == 0

worst = max(abs(e) for e in errors)
mean = sum(abs(e) for e in errors) / len(errors)
print(f"eta error (relative, floor 30 min): mean {mean * 100:.0f} %, worst {worst * 100:.0f} %")
assert worst < 0.5, "the time estimate is off by more than half"

# unplugged in the middle: back to the voltage, and a new charge starts from the new rest value
for _ in range(60):
    clock[0] += STEP
    est.update(-600, "Not Charging", 70)
assert est.percent is None and est.eta_min is None
clock[0] += STEP
est.update(1500, "Fast charge (CC mode)", 100)
assert abs(est.percent - 70) < 1, f"a new charge should start from about 70 %, got {est.percent}"

# the cable is swapped after a while (a few seconds without charge in between): the new charge goes on from what was reached
swap = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    swap.update(-600, "Not Charging", 30)
for _ in range(240):  # 20 minutes at 2 A: about 6.7 % of 10 Ah... (it is 667 mAh)
    clock[0] += STEP
    swap.update(2000, "Fast charge (CC mode)", 100)
reached = swap.percent
for _ in range(3):  # unplugged, 15 s
    clock[0] += STEP
    swap.update(-300, "Not Charging", 100)
clock[0] += STEP
swap.update(3000, "Fast charge (CC mode)", 100)  # the other charger
assert abs(swap.percent - reached) < 1.5, f"the swap lost the progress: {reached:.1f} -> {swap.percent:.1f}"

# a false "Taper / CV" report for a moment while the voltage is far from the limit: no jump to the end
flick = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    flick.update(-600, "Not Charging", 35, 7000, 8300)
for _ in range(30):
    clock[0] += STEP
    flick.update(500, "Fast charge (CC mode)", 35, 7900, 8300)
for _ in range(2):  # fewer than the readings that make it real
    clock[0] += STEP
    flick.update(20, "Taper Charge (CV mode)", 35, 7900, 8300)
clock[0] += STEP
flick.update(500, "Fast charge (CC mode)", 35, 7900, 8300)
assert flick.percent < 40, f"a false CV report moved the percent to {flick.percent:.1f}"
for _ in range(10):  # a real one: near the limit, and it stays
    clock[0] += STEP
    flick.update(900, "Taper Charge (CV mode)", 35, 8280, 8300)
assert flick.phase == "cv" and flick.percent >= 85, f"the real CV phase was not taken: {flick.phase} {flick.percent}"

# a charge that is already running when the estimate starts: the starting point is a guess, and the note goes at CV
late = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
clock[0] += STEP
late.update(2000, "Fast charge (CC mode)", 60, 7900, 8300)
assert late.start_uncertain is True, "no rest readings: the start should be marked as a guess"
for _ in range(6):
    clock[0] += STEP
    late.update(1800, "Taper Charge (CV mode)", 60, 8290, 8300)
assert late.start_uncertain is False, "the step to CV should correct the guess"
known = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(10):
    clock[0] += STEP
    known.update(-500, "Not Charging", 40, 7000, 8300)
clock[0] += STEP
known.update(2000, "Fast charge (CC mode)", 90, 7900, 8300)
assert known.start_uncertain is False, "a charge after rest readings is not a guess"

# hardly any current (the box takes what the input gives): no time to name
slow = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(10):
    clock[0] += STEP
    slow.update(-100, "Not Charging", 50)
for _ in range(5):
    clock[0] += STEP
    slow.update(20, "Fast charge (CC mode)", 100)
assert slow.eta_min is None

print("ok")
