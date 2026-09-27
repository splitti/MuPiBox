#!/usr/bin/env python3
"""Setzt Startbild bzw. Wartungsbild der MuPiBox zusammen (800 x 480 PNG).

Aufruf:
  compose_bootscreen.py splash  <bootscreen-id> <name> <out.png>
  compose_bootscreen.py wartung <bootscreen-id> <update|install|wlan> <sprache> <out.png>
  compose_bootscreen.py screen  <bootscreen-id> <goodbye|battery> <sprache> <out.png>
  compose_bootscreen.py apply   [<ausgabe-ordner>]   alle Bilder nach /etc/mupibox/mupiboxconfig.json

Benötigt: python3-pil, librsvg2-bin (rsvg-convert), Fredoka als Systemschrift (fontconfig) und als Datei.
Text in Schriften, die Fredoka nicht hat (Kyrillisch, Griechisch), in DejaVu Sans.
"""
import json, re, subprocess, sys, tempfile, os, html
from PIL import ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(BASE, "..", "bootscreens.json"), encoding="utf-8"))
FONT_CANDIDATES = [
    "/usr/local/share/fonts/mupibox/Fredoka-Variable.ttf",
    CFG["font"]["file"],
    "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/_fonts/Fredoka-Variable.ttf",
    os.path.join(BASE, "..", "..", "..", "themes", "_fonts", "Fredoka-Variable.ttf"),
]
FONT = next((f for f in FONT_CANDIDATES if os.path.isfile(f)), CFG["font"]["file"])
FALLBACK = {400: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 600: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"}
FAMILY = "Fredoka"

def font(size, weight):
    if FAMILY != "Fredoka":
        return ImageFont.truetype(FALLBACK[600 if weight >= 600 else 400], size)
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])  # Fredoka variable: wght
    except Exception:
        pass
    return f

def fredoka_has(text):
    """True if Fredoka has every letter of the text (else the .notdef box would be drawn)."""
    f = ImageFont.truetype(FONT, 40)
    nodef = chr(0xFFFF)  # a code point no font has: its box is what a missing letter looks like
    missing = f.getmask(nodef).getbbox(), f.getlength(nodef)
    return all(ch.isspace() or (f.getmask(ch).getbbox(), f.getlength(ch)) != missing for ch in text)

def use_family_for(*texts):
    global FAMILY
    FAMILY = "Fredoka" if fredoka_has("".join(texts)) else "DejaVu Sans"

def shadows(spec):
    out = []
    if not spec or spec == "none":
        return out
    for part in re.split(r",(?![^()]*\))", spec):
        m = re.match(r"\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(.+)", part.strip())
        if m and float(m.group(3)) == 0:  # Blur-Schatten ignorieren
            out.append((float(m.group(1)), float(m.group(2)), m.group(4).strip()))
    return out

def text_el(txt, x, y, size, weight, color, anchor, ls, shadow, scale=1.0, ox=0):
    t = html.escape(txt)
    base = f'font-family="{FAMILY}" font-size="{size}" font-weight="{weight}" letter-spacing="{ls}" text-anchor="{anchor}"'
    # y is the top of the text: librsvg does not know dominant-baseline="text-before-edge", so the baseline is placed
    # one ascent below it (the same line a browser uses for text-before-edge)
    asc = font(size, weight).getmetrics()[0]
    g = f'<g transform="translate({ox} {y}) scale({scale}) translate({-ox} {-y})">'
    for dx, dy, c in reversed(shadow):
        g += f'<text x="{x+dx}" y="{y+dy+asc}" {base} fill="{c}">{t}</text>'
    g += f'<text x="{x}" y="{y+asc}" {base} fill="{color}">{t}</text></g>'
    return g

def wrap(txt, f, maxw, maxlines):
    words, lines, cur = txt.split(" "), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if f.getlength(test) <= maxw or not cur:
            cur = test
        else:
            lines.append(cur); cur = w
    lines.append(cur)
    return lines[:maxlines]

def render(svg_scene, overlay, out):
    scene = open(svg_scene, encoding="utf-8").read()
    inner = re.sub(r"^.*?<svg[^>]*>", "", scene, flags=re.S).rsplit("</svg>", 1)[0]
    inner = re.sub(r"<metadata.*?</metadata>", "", inner, flags=re.S)  # c2pa manifest: its namespace is on the dropped root
    doc = f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="480" viewBox="0 0 800 480">{inner}{overlay}</svg>'
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as tmp:
        tmp.write(doc)
    subprocess.run(["rsvg-convert", "-w", "800", "-h", "480", "-b", "white", "-o", out, tmp.name], check=True)
    os.unlink(tmp.name)

def bs(bid):
    for b in CFG["bootscreens"]:
        if b["id"] == bid:
            return b
    raise SystemExit("unbekannter Bootscreen: " + bid)

def splash(bid, name, out):
    b, n = bs(bid), b_name(name)
    use_family_for(n)
    s = b["name"]
    f = font(s["fontSize"], s["fontWeight"])
    w = f.getlength(n) + s["letterSpacing"] * (len(n) - 1)
    scale = min(1.0, s["maxWidth"] / max(1, w))
    center = s["align"] == "center"
    x = 400 if center else s["x"]
    ov = text_el(n, x, s["y"], s["fontSize"], s["fontWeight"], s["color"], "middle" if center else "start", s["letterSpacing"], shadows(s["textShadow"]), scale, x)
    render(os.path.join(BASE, "..", b["scene"]), ov, out)

def b_name(name):
    name = (name or "").strip()[: CFG["nameMaxLength"]]
    return name or CFG["defaultName"]

def wartung(bid, kind, lang, out):
    """Title + line of text on the scene of the kind: the maintenance screens (update, install, wlan) on the scene
    with the hard hat, goodbye and battery on their own scenes. Text area: <kind>Text of the scene, else the
    maintenance text's (the same place as the name in the boot screen)."""
    b = bs(bid)
    scene = kind if kind in ("goodbye", "battery") else "maintenance"
    m = b.get(kind + "Text") or b["maintenanceText"]
    title, sub = CFG["texts"][kind].get(lang) or CFG["texts"][kind]["en"]
    use_family_for(title, sub)
    center = m["align"] == "center"; x = 400 if center else m["x"]; anchor = "middle" if center else "start"
    ft = font(m["titleSize"], m["titleWeight"]); fs = font(m["subSize"], m["subWeight"])
    sh = shadows(m["textShadow"])
    # the title in at most 2 lines: smaller when it needs more (nothing is cut off)
    title_size = m["titleSize"]
    while True:
        tlines = wrap(title, ft, m["maxWidth"], 99)
        if len(tlines) <= 2 or title_size <= 24:
            break
        title_size -= 1
        ft = font(title_size, m["titleWeight"])
    tlines = tlines[:2]
    tscale = min(1.0, m["maxWidth"] / max(1, max(ft.getlength(l) for l in tlines)))
    y = m["y"]; ov = ""
    for l in tlines:
        ov += text_el(l, x, y, title_size, m["titleWeight"], m["color"], anchor, -1, sh, tscale, x)
        y += title_size * 1.05 * tscale
    y += m["gap"]
    p = m["subPill"]
    # the line of text in at most subMaxLines lines: smaller when it needs more (nothing is cut off)
    sub_size = m["subSize"]
    while True:
        sub_lines = wrap(sub, fs, m["maxWidth"] - 2 * p["padX"], 99)
        if len(sub_lines) <= m["subMaxLines"] or sub_size <= 14:
            break
        sub_size -= 1
        fs = font(sub_size, m["subWeight"])
    for line in sub_lines[: m["subMaxLines"]]:
        lw = fs.getlength(line) + 2 * p["padX"]; lh = sub_size + 2 * p["padY"]
        rx = x - lw / 2 if center else x
        ov += f'<rect x="{rx}" y="{y}" width="{lw}" height="{lh}" rx="{p["radius"]}" fill="{p["background"]}"/>'
        tx = x if center else x + p["padX"]
        ov += text_el(line, tx, y + p["padY"], sub_size, m["subWeight"], p["color"], anchor, 0, [])
        y += lh + p["lineGap"]
    render(os.path.join(BASE, "..", b[scene]), ov, out)

def apply(outdir):
    """All pictures the box needs for its settings (mupibox.bootscreen, maintenanceScreen, boxName,
    bootscreenLanguage): splash-<id>.png for the boot screen (all 15 for "random") and maintenance-<id>-<kind>.png
    for the maintenance screen ("same" = the boot screen's; for "random" all 15)."""
    conf = json.load(open("/etc/mupibox/mupiboxconfig.json", encoding="utf-8")).get("mupibox", {})
    ids = [b["id"] for b in CFG["bootscreens"]]
    boot = conf.get("bootscreen") or CFG["defaultBootscreen"]
    if boot != "random" and boot not in ids:
        boot = CFG["defaultBootscreen"]
    maint = conf.get("maintenanceScreen") or "same"
    if maint != "same" and maint not in ids:
        maint = "same"
    lang = conf.get("bootscreenLanguage") or CFG.get("defaultLanguage", "en")
    name = conf.get("boxName") or ""
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):  # pictures of earlier settings
        if f.endswith(".png"):
            os.unlink(os.path.join(outdir, f))
    boot_ids = ids if boot == "random" else [boot]
    maint_ids = boot_ids if maint == "same" else [maint]
    for bid in boot_ids:
        splash(bid, name, os.path.join(outdir, f"splash-{bid}.png"))
    for bid in maint_ids:
        for kind in ("update", "install", "wlan"):
            wartung(bid, kind, lang, os.path.join(outdir, f"maintenance-{bid}-{kind}.png"))
    # goodbye and battery empty (the box switches off): the scenes that belong to the boot screen shown at that start
    for bid in boot_ids:
        for kind in ("goodbye", "battery"):
            wartung(bid, kind, lang, os.path.join(outdir, f"{kind}-{bid}.png"))
    colors = {b["id"]: b["baseColor"] for b in CFG["bootscreens"]}
    with open(os.path.join(outdir, "colors.txt"), "w") as f:
        f.write("".join(f"{bid} {colors[bid]}" + chr(10) for bid in ids))
    print(f"boot={boot} maintenance={maint} lang={lang} name={b_name(name)!r} -> {len(boot_ids)} splash, {3 * len(maint_ids)} maintenance, {2 * len(boot_ids)} goodbye/battery")

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["splash"] and len(a) == 4:
        splash(a[1], a[2], a[3])
    elif a[:1] == ["wartung"] and len(a) == 5:
        wartung(a[1], a[2], a[3], a[4])
    elif a[:1] == ["screen"] and len(a) == 5:
        wartung(a[1], a[2], a[3], a[4])
    elif a[:1] == ["apply"] and len(a) <= 2:
        apply(a[1] if len(a) == 2 else "/home/dietpi/MuPiBox/sysmedia/images/bootscreen")
    else:
        raise SystemExit(__doc__)
