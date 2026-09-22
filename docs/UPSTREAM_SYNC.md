# Upstream-Abgleich: splitti/MuPiBox als Basis

Dieser Fork baut auf dem Haupt-Repo **splitti/MuPiBox** auf. Der Upstream-Stand ist
die Basis, unsere GUI-Anpassungen liegen als Merge-Commits darüber.

## Was „DEV" konkret ist

Es gibt **keinen Branch namens `dev`**. Der DEV-Kanal wird über `version.json`
im Haupt-Repo gesteuert:

```
"release": { "dev": [ { "version": "5.0.1", "url": ".../tags/5.0.1.zip" } ] }
```

Das dort genannte Tag ist der veröffentlichte DEV-Stand. Es liegt immer auf
`upstream/main`; dieser Branch ist in der Regel ein paar Commits weiter und
wird beim nächsten DEV-Release getaggt.

> Im Haupt-Repo existiert zusätzlich ein altes Tag `dev` von 2023. Das ist ein
> Überbleibsel und **nicht** der DEV-Kanal.

Wir nehmen `upstream/main` als Basis, weil dort die Fixes nach dem letzten Tag
bereits enthalten sind.

## Remote einrichten (einmalig)

```bash
git remote add upstream https://github.com/splitti/MuPiBox.git
git remote set-url --push upstream no_push
```

## Ablauf beim Nachziehen

```bash
git fetch upstream --prune
git status --short            # Arbeitsbaum muss sauber sein
git branch sync-backup-$(date +%Y%m%d)
git merge --no-commit --no-ff upstream/main
```

Danach die Konflikte nach der Regel unten auflösen, dann:

```bash
npm install
npm run build                 # muss fehlerfrei durchlaufen
```

`deploy.zip` neu bauen (siehe unten), alles stagen, Merge committen.

## Konflikt-Regel

**Unser Design gewinnt, die Funktion dahinter kommt mit.**

Bei einer Datei, die beide Seiten geändert haben:

1. Unser Markup, unsere Styles, unsere deutschen Texte und unsere
   Lucide-Icons bleiben.
2. Was Upstream an **Verhalten** ergänzt hat — neue Medientypen, Caching,
   Fehlerbehandlung, neue Felder im Datenmodell — wird in unsere Fassung
   übernommen, nicht weggeworfen.
3. Was Upstream an **Aussehen** ergänzt hat und unsere Gestaltung ersetzen
   würde, bleibt draußen.

Upstreams Ionic-Kopfzeilen (`ion-header`/`ion-toolbar`), Segment-Leisten und
das Cover-Flow-Theme fallen unter Punkt 3: sie bauen genau die Ansichten
nach, die unser Figma-Redesign ersetzt hat.

Typische Stolperstelle: Ein `.ts` mergt automatisch auf Upstreams Variante,
während das zugehörige `.html` unseres bleibt — dann zeigt das Template auf
Felder, die es nicht mehr gibt. Nach jedem Merge deshalb immer bauen.

## deploy.zip neu bauen

`bin/nodejs/deploy.zip` ist ein eingechecktes Build-Artefakt und muss nach
jeder Änderung am Frontend oder Backend neu erzeugt werden. Unter Linux/macOS
erledigt das `src/deploy.sh`.

Auf einem Windows-Rechner ohne `zip`:

```bash
rm -rf src/deploy
npm run build
mv src/deploy/www/browser/* src/deploy/www/
rmdir src/deploy/www/browser
rm -f src/deploy/www/prerendered-routes.json
cp src/backend-player/README.md src/deploy/
# danach src/deploy als ZIP mit Schrägstrichen in den Pfaden packen
rm -rf src/deploy
```

Wichtig: Die Einträge im Archiv müssen `/` als Trenner verwenden, sonst kann
`unzip` auf der Box sie nicht auspacken. `Compress-Archive` aus PowerShell 5.1
ist dafür nicht geeignet.

## Installation dieses Forks auf der Box

Das Update-Skript kann den Branch dieses Forks installieren:

```bash
start_mupibox_update.sh <version> <branch> <owner/repo>
```

Der Ordnername im Archiv wird aus dem Archiv selbst gelesen, der Fork muss
also nicht „MuPiBox" heißen.
