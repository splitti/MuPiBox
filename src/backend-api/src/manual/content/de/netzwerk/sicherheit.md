# Passwort und HTTPS

**Einstellungen › Sicherheit**

## Passwort

Unter **Passwort & Anmeldung** vergibst du das Passwort für die ganze App. Es gilt am Handy genauso wie am PC.

| Aktion | Hinweis |
| --- | --- |
| **Passwort ändern** | das aktuelle und das neue Passwort eintragen, mindestens 6 Zeichen |
| **Passwort entfernen** | die App ist danach ohne Passwort erreichbar, aber nur im Heimnetz |
| **Anmeldung verlangen** | schützt zusätzlich die Display-Seite und die Schnittstelle der Box vor Zugriffen aus dem Netzwerk. Wirkt sofort |

Das Anmelden geht auch ohne Passwort: per **QR-Code am Display** (Statusanzeige lange drücken, siehe [Einstellungen am Display](../bedienung/eltern-zugang.md)) oder mit einem **Link über Telegram** ([Telegram](telegram.md)). Die Seite zeigt auch die **angemeldeten Geräte**.

> [!NOTE]
> Das Display der Box selbst, ihre Skripte und der Telegram-Bot laufen auf der Box und sind von der Anmeldung nie betroffen. Sie behindert nur Zugriffe von anderen Geräten im Netzwerk.

## Verschlüsselung (HTTPS)

Ohne HTTPS wandern Passwort und Eingaben unverschlüsselt durch dein Heimnetz. Die Seite **Einstellungen › Sicherheit › Verschlüsselung (HTTPS)** kümmert sich um die sichere Verbindung.

### Zertifikat

Die Box erzeugt ein **eigenes Zertifikat** und erneuert es rechtzeitig selbst (ein Dienst prüft das täglich). Alternativ lädst du ein **eigenes Zertifikat** hoch. Die Box erinnert dich dann vor dem Ablauf. Gilt ein eigenes Zertifikat für keine der Adressen, unter denen die Box gerade erreichbar ist, warnt die Seite: Der Browser meldet dort eine Warnung.

### Dem Zertifikat vertrauen

Da das Zertifikat von der Box selbst stammt und nicht von einer öffentlichen Stelle, warnt der Browser beim ersten Besuch. Die Seite zeigt oben, ob **dieses Gerät der Box vertraut** und ob es sicher verbunden ist. Vertraut es ihr noch nicht, installierst du das Zertifikat **einmal** auf dem Gerät. Die Seite erklärt die Schritte für **Android**, **iPhone/iPad**, **Windows** und **Mac**, jeweils mit **Zertifikat laden**. Danach warnt der Browser nicht mehr.

### Nur sichere Verbindung

Mit **http auf https umleiten** öffnet sich die App immer über https, auch über den QR-Code am Display und über Telegram-Links. Der Schalter lässt sich erst einschalten, wenn dein Gerät der Box vertraut. Sonst würdest du dich aussperren.

### App installieren

Mit einer sicheren Verbindung lässt sich die App wie eine **App installieren**: Android installiert sie auf Wunsch direkt, auf dem iPhone nimmst du „Zum Home-Bildschirm“. Danach startet sie ohne Adressleiste.
