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

# the end: the charger says done (and stays at it)
for _ in range(3):
    clock[0] += STEP
    est.update(0, "Charge Termination Done", 100)
print(f"done: percent {est.percent}  eta {est.eta_min}")
assert est.percent == 100.0 and est.eta_min == 0

worst = max(abs(e) for e in errors)
mean = sum(abs(e) for e in errors) / len(errors)
print(f"eta error (relative, floor 30 min): mean {mean * 100:.0f} %, worst {worst * 100:.0f} %")
assert worst < 0.5, "the time estimate is off by more than half"

# unplugged for long (more than the settling time): back to the voltage, and a new charge starts from the new rest value
for _ in range(400):
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

# the cable out for five minutes in the middle of a charge: the voltage at rest still reads the charge (80 %), the new
# charge goes on from what was reached less what the box used meanwhile, not from the voltage
pause = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    pause.update(-650, "Not Charging", 44, 7220, 8300)
for _ in range(1200):  # 100 minutes at 0.65 A: about 1.05 Ah, 7 % of 15 Ah
    clock[0] += STEP
    pause.update(650, "Fast charge (CC mode)", 100, 7900, 8300)
reached = pause.percent
for _ in range(60):  # five minutes without the cable, 0.65 A taken
    clock[0] += STEP
    pause.update(-650, "Not Charging", 80, 7730, 8300)
clock[0] += STEP
pause.update(620, "Fast charge (CC mode)", 100, 8100, 8300)
assert reached - 1.0 < pause.percent < reached, f"after a short pause the charge should go on from about {reached:.1f} %, got {pause.percent:.1f}"

# the charge current goes up and down (the box takes part of the input: a playing amplifier): the time until full stays calm
calm = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    calm.update(-600, "Not Charging", 50, 7300, 8300)
for k in range(360):  # 30 minutes of 650 mA and 250 mA, five minutes each
    clock[0] += STEP
    calm.update(650 if (k // 60) % 2 == 0 else 250, "Fast charge (CC mode)", 100, 7900, 8300)
etas = []
for k in range(480):  # 40 minutes more of the same
    clock[0] += STEP
    calm.update(650 if (k // 60) % 2 == 0 else 250, "Fast charge (CC mode)", 100, 7900, 8300)
    etas.append(calm.eta_min)
spread = (max(etas) - min(etas)) / (sum(etas) / len(etas))
assert spread < 0.35, f"the time until full jumps with the current: {min(etas)}..{max(etas)} min"

# a weak input: "Done" for a minute at 8.05 V (limit 8.30), then the charge goes on - several times; it stays a charge
weak = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    weak.update(-650, "Not Charging", 69, 7700, 8300)
for _ in range(3):
    for _ in range(120):
        clock[0] += STEP
        weak.update(600, "Fast charge (CC mode)", 100, 8150, 8300)
    for _ in range(12):
        clock[0] += STEP
        weak.update(0, "Charge Termination Done", 100, 8050, 8300)
assert weak.percent < 85, f"a Done far below the limit moved the percent to {weak.percent:.1f}"
# ... and a Done that stays far below the limit (under the recharge level) stays no end, however long
for _ in range(720):
    clock[0] += STEP
    weak.update(0, "Charge Termination Done", 100, 8050, 8300)
assert weak.phase != "done", "a long Done at 8.05 V of 8.30 should not count as full"

# the real end on a weak input: straight out of CC at 8.26 V, then Done - and the pack drops to 8.15 V at once
real = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    real.update(-650, "Not Charging", 70, 7700, 8300)
for _ in range(240):
    clock[0] += STEP
    real.update(580, "Fast charge (CC mode)", 100, 8250, 8300)
for _ in range(3):  # near the end it goes back and forth: a minute of Done, then CC again - no end yet
    for _ in range(12):
        clock[0] += STEP
        real.update(0, "Charge Termination Done", 100, 8120, 8300)
    assert real.phase != "done", "a Done of a minute between CC readings should not count yet"
    for _ in range(24):
        clock[0] += STEP
        real.update(560, "Fast charge (CC mode)", 100, 8225, 8300)
for _ in range(70):
    clock[0] += STEP
    real.update(0, "Charge Termination Done", 100, 8146, 8300)
assert real.phase == "done" and real.percent == 100.0, f"the end after 8.25 V was not taken: {real.phase} {real.percent}"
# the chip charges again a little later: it stays full
for _ in range(60):
    clock[0] += STEP
    real.update(600, "Fast charge (CC mode)", 100, 8250, 8300)
assert real.phase == "done" and real.percent == 100.0 and real.eta_min is None, "a top-up after the end should stay full"
# the cable out: what was reached (100 %) less what was used
for _ in range(12):
    clock[0] += STEP
    real.update(-650, "Not Charging", 95, 8000, 8300)
assert real.settling and 99 < real.percent <= 100, f"after the end and the cable out: {real.percent}"

# the same end with nothing known from before (the service restarted after the Done): the Done held for half an hour
# above the recharge level counts
late_end = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(300):
    clock[0] += STEP
    late_end.update(0, "Charge Termination Done", 100, 8162, 8300)
assert late_end.phase != "done", "a Done far from the limit should not count at once"
for _ in range(100):
    clock[0] += STEP
    late_end.update(0, "Charge Termination Done", 100, 8162, 8300)
assert late_end.phase == "done" and late_end.percent == 100.0, "a Done held for half an hour at 8.16 V should count"

# the cable out after a charge: the voltage still reads high (90 %), the box shows what the charge reached, less what
# it used - and the voltage again only after the pack has settled
out = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    out.update(-650, "Not Charging", 70, 7600, 8300)
for _ in range(720):  # an hour at 0.6 A
    clock[0] += STEP
    out.update(600, "Fast charge (CC mode)", 100, 8100, 8300)
reached = out.percent
for _ in range(24):  # two minutes without the cable
    clock[0] += STEP
    out.update(-650, "Not Charging", 90, 7950, 8300)
assert out.settling and reached - 1 < out.percent <= reached, f"after the cable went out it should show about {reached:.1f}, got {out.percent}"
for _ in range(400):  # more than half an hour later: the voltage again
    clock[0] += STEP
    out.update(-650, "Not Charging", 74, 7700, 8300)
assert out.percent is None and not out.settling, "after the settling time the voltage should count again"

# a false "Done" or "Top-off" in the middle of the CC phase (after an I2C error of the chip): the percent stays where it was
glitch = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(60):
    clock[0] += STEP
    glitch.update(-650, "Not Charging", 44, 7220, 8400)
for _ in range(240):
    clock[0] += STEP
    glitch.update(640, "Fast charge (CC mode)", 100, 7570, 8400)
before = glitch.percent
for status in ("Charge Termination Done", "Top-off Timer Active Charging", "Charge Termination Done"):
    clock[0] += STEP
    glitch.update(0, status, 100, 7570, 8400)
    clock[0] += STEP
    glitch.update(640, "Fast charge (CC mode)", 100, 7570, 8400)
assert glitch.phase == "cc" and glitch.percent < 60, f"a false end report moved the percent to {glitch.percent:.1f} ({glitch.phase})"
assert glitch.percent >= before, "the percent went backwards"
assert glitch.eta_min is not None and glitch.eta_min > 300, f"the time left should still be hours, got {glitch.eta_min}"
for _ in range(3):  # a real end: near the limit, and it stays
    clock[0] += STEP
    glitch.update(0, "Charge Termination Done", 100, 8380, 8400)
assert glitch.percent == 100.0 and glitch.eta_min == 0, f"the real end was not taken: {glitch.percent}"

# a charge that is already running when the estimate starts: the starting point is a guess, and the note goes at CV
late = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
clock[0] += STEP
late.update(2000, "Fast charge (CC mode)", 60, 7900, 8300)
assert late.start_uncertain is True, "no rest readings: the start should be marked as a guess"
for _ in range(6):
    clock[0] += STEP
    late.update(1800, "Taper Charge (CV mode)", 60, 8290, 8300)
assert late.start_uncertain is False, "the step to CV should correct the guess"
# the guess was too high (the voltage read 100 % while it charged): the step to CV corrects it downwards, once
high = ChargeEstimator(capacity_mah=CAP, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
clock[0] += STEP
high.update(2000, "Fast charge (CC mode)", 100, 7900, 8300)
assert high.start_uncertain and high.percent >= 85
for _ in range(6):
    clock[0] += STEP
    high.update(1800, "Taper Charge (CV mode)", 100, 8290, 8300)
assert not high.start_uncertain and high.percent < 90, f"the too high guess was not corrected: {high.percent:.1f}"
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

# as good as full (after a restart of the box the chip charges again, on a weak input in CC at the limit): no time
nearly = ChargeEstimator(capacity_mah=15000, iterm_ma=ITERM, clock=lambda: clock[0], wall=lambda: clock[0])
for _ in range(10):
    clock[0] += STEP
    nearly.update(-400, "Not Charging", 99.5, 8250, 8300)
for _ in range(60):
    clock[0] += STEP
    nearly.update(565, "Fast charge (CC mode)", 100, 8296, 8300)
assert nearly.percent >= 99 and nearly.eta_min is None, f"at {nearly.percent:.1f} % a time of {nearly.eta_min} min"

print("ok")
