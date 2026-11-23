#!/usr/bin/env python3
"""Setzt Startbild bzw. Wartungsbild der MuPiBox zusammen (800 x 480 PNG).

Aufruf:
  compose_bootscreen.py splash  <bootscreen-id> <name> <out.png>
  compose_bootscreen.py wartung <bootscreen-id> <update|install|wlan> <sprache> <out.png>
  compose_bootscreen.py screen  <bootscreen-id> <goodbye|battery> <sprache> <out.png>
  compose_bootscreen.py apply   [<ausgabe-ordner>]   alle Bilder nach /etc/mupibox/mupiboxconfig.json
  compose_bootscreen.py fortschritt <wartungsbild.png> <bootscreen-id> <prozent> <abschnitt> <sprache> <out.png>
      das Wartungsbild des Updates mit Fortschrittsleiste (abschnitt: prepare download packages install settings
      done failed - Texte in texts.progress)

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
    "/home/dietpi/.mupibox/server/www/theme-data/_fonts/Fredoka-Variable.ttf",
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

def css_rgba(c, default=(255, 255, 255, 235)):
    """#RRGGBB or rgba(r, g, b, a) as an RGBA tuple for PIL."""
    c = (c or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", c):
        return tuple(int(c[i : i + 2], 16) for i in (1, 3, 5)) + (255,)
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)", c)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), round(float(m.group(4) or 1) * 255))
    return default

def fortschritt(picture, bid, pct, phase, lang, out):
    """The maintenance picture of the update with the progress at its foot: a bar of the scene's pill (the colours of
    its line of text), a sentence on the part of the update and the percent, under it the bar - in the title's colour
    when that is dark, else in the pill's text colour. Where the maintenance text reaches down into the foot, the bar
    goes beside it (text on the right: the left half) or to the top. phase "failed" (an abort after which the box
    has to be restarted - any other abort brings the display back by itself): the sentence in red, no percent.
    The picture as it is (the boot screen's maintenance picture), so this takes about half a second."""
    from PIL import Image, ImageDraw
    try:
        b = bs(bid)
    except SystemExit:
        b = {}
    m = b.get("maintenanceText", {})
    p = m.get("subPill", {})
    texts = CFG["texts"].get("progress", {})
    text = (texts.get(lang) or texts.get("en") or {}).get(phase, "")
    use_family_for(text)
    failed = phase == "failed"
    pct = max(0, min(100, int(pct)))
    img = Image.open(picture).convert("RGBA")
    W, H = img.size
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bg = css_rgba(p.get("background"), (255, 255, 255, 235))
    ink = (0xB4, 0x3C, 0x2E, 255) if failed else css_rgba(p.get("color"), (0x1E, 0x2A, 0x44, 255))
    title = css_rgba(m.get("color"), (0x1E, 0x2A, 0x44, 255))
    bar = title if (0.299 * title[0] + 0.587 * title[1] + 0.114 * title[2]) / 255 < 0.55 else ink
    if failed:
        bar = ink
    # where: the foot over the whole width - unless the maintenance text (title and up to its lines of the pill) is there
    x0, x1 = 46, W - 46
    y1 = H - 22
    y0 = y1 - 74
    text_bottom = m.get("y", 50) + m.get("titleSize", 50) + m.get("gap", 10) + m.get("subMaxLines", 2) * (m.get("subSize", 21) + 2 * p.get("padY", 6) + p.get("lineGap", 6))
    if text_bottom > y0 - 8:
        if m.get("x", 46) >= W / 2 and m.get("align", "left") == "left":
            x1 = m["x"] - 16
        else:
            y0, y1 = 22, 96
    d.rounded_rectangle((x0, y0, x1, y1), radius=p.get("radius", 16) + 2, fill=bg)
    label = "" if failed else f"{pct} %"
    # (a narrow bar: the text smaller until text and percent fit side by side; at the smallest cut with "…")
    for size in (21, 19, 17, 15):
        f_text, f_pct = font(size, 500), font(size, 600)
        room = x1 - x0 - 36 - (d.textlength(label, font=f_pct) + 16 if label else 0)
        if d.textlength(text, font=f_text) <= room:
            break
    while len(text) > 1 and d.textlength(text, font=f_text) > room:
        text = text[:-2].rstrip() + "…"
    d.text((x0 + 18, y0 + 12), text, font=f_text, fill=ink)
    if label:
        d.text((x1 - 18 - d.textlength(label, font=f_pct), y0 + 12), label, font=f_pct, fill=ink)
    bx0, bx1, by0, by1 = x0 + 18, x1 - 18, y0 + 46, y0 + 58
    d.rounded_rectangle((bx0, by0, bx1, by1), radius=6, fill=bar[:3] + (60,))
    if failed:
        d.rounded_rectangle((bx0, by0, bx1, by1), radius=6, fill=bar[:3] + (120,))
    elif pct > 0:
        d.rounded_rectangle((bx0, by0, bx0 + max(12, round((bx1 - bx0) * pct / 100)), by1), radius=6, fill=bar[:3] + (255,))
    Image.alpha_composite(img, layer).convert("RGB").save(out, "PNG")

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
    elif a[:1] == ["fortschritt"] and len(a) == 7:
        fortschritt(a[1], a[2], a[3], a[4], a[5], a[6])
    elif a[:1] == ["apply"] and len(a) <= 2:
        apply(a[1] if len(a) == 2 else "/home/dietpi/MuPiBox/sysmedia/images/bootscreen")
    else:
        raise SystemExit(__doc__)
