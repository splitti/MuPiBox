# Passwort und HTTPS

**Einstellungen › Sicherheit**

## Passwort

Unter **Passwort & Anmeldung** vergibst du das Passwort für die ganze App. Es gilt am Handy genauso wie am PC und auch für das bisherige Admin-Interface.

| Karte | Was du dort tust |
| --- | --- |
| **Passwort** | **Passwort festlegen** (beim ersten Mal) oder **Passwort ändern**: das aktuelle Passwort und zweimal das neue eintragen, mindestens 6 Zeichen. Ein neues Passwort meldet alle anderen Geräte ab |
| **Anmeldung** | **Anmeldung verlangen**: Die App fragt im Heimnetz nach dem Passwort. Das schützt zusätzlich die Display-Seite und die Schnittstelle der Box vor Zugriffen aus dem Netzwerk. Wirkt sofort und lässt sich erst einschalten, wenn ein Passwort festgelegt ist |
| **Angemeldete Geräte** | die Geräte, die gerade angemeldet sind. Einzelne meldest du mit **Abmelden** ab, alle außer diesem mit **Alle anderen abmelden** |

Zeigt die Karte **Standardpasswort**, gilt noch das Passwort aus dem Admin-Interface. Lege dann ein eigenes fest.

Das Anmelden geht auch ohne Passwort: per **QR-Code am Display** (die Status-Symbole oben lange drücken, siehe [Einstellungen am Display](../bedienung/eltern-zugang.md)) oder mit einem **Link über Telegram** (`/login`, siehe [Telegram](telegram.md)).

**Passwort vergessen?** Komm über den QR-Code oder Telegram in die App. Danach lässt sich 10 Minuten lang ein neues Passwort ohne das alte festlegen.

> [!NOTE]
> Das Display der Box selbst, ihre Skripte und der Telegram-Bot laufen auf der Box und sind von der Anmeldung nie betroffen. Sie behindert nur Zugriffe von anderen Geräten im Netzwerk.

## Verschlüsselung (HTTPS)

Ohne HTTPS wandern Passwort und Eingaben unverschlüsselt durch dein Heimnetz. Die Seite **Einstellungen › Sicherheit › Verschlüsselung (HTTPS)** kümmert sich um die sichere Verbindung.

### Zertifikat

Die Box hat ein **eigenes Zertifikat**. Sie prüft es bei jedem Start und einmal täglich und erneuert es rechtzeitig selbst, auch wenn sich ihre Adresse geändert hat. Auf den Geräten muss dafür nichts neu installiert werden. Alternativ lädst du unter **Eigenes Zertifikat (für Fortgeschrittene)** ein eigenes Zertifikat samt Schlüssel hoch. Die Box erinnert dich dann vor dem Ablauf. Gilt ein eigenes Zertifikat für keine der Adressen, unter denen die Box gerade erreichbar ist, warnt die Seite: Der Browser meldet dort eine Warnung. **Zurück zum Zertifikat der Box** setzt wieder das eigene Zertifikat der Box ein.

### Dem Zertifikat vertrauen

Da das Zertifikat von der Box selbst stammt und nicht von einer öffentlichen Stelle, warnt der Browser beim ersten Besuch. Die Seite zeigt oben, ob **dieses Gerät der Box vertraut** und ob es sicher verbunden ist. Vertraut es ihr noch nicht, folgst du einmal den Schritten unter **Diesem Gerät die Box bekannt machen**: **Zertifikat laden**, **Auf dem Gerät installieren** (mit einer Anleitung für **Android**, **iPhone / iPad**, **Windows** und **Mac**) und **Über https öffnen**. Danach warnt der Browser nicht mehr.

### Nur sichere Verbindung

Mit **http auf https umleiten** öffnet sich die App immer über https, auch über den QR-Code am Display und über Telegram-Links. Der Schalter lässt sich erst einschalten, wenn dein Gerät der Box vertraut. Sonst würdest du dich aussperren. Ausgenommen sind das Display der Box und Port 8200: Dort ist die App immer per http erreichbar.

### Adresse für Links

Unter **Adresse für Links** legst du fest, unter welchem Namen QR-Code und Telegram-Links die Box nennen. Leer bedeutet die IP-Adresse der Box.

### App installieren

Mit einer sicheren Verbindung lässt sich die App wie eine App installieren: auf Android in Chrome im Menü „App installieren“, auf dem iPhone in Safari über Teilen › „Zum Home-Bildschirm“. Danach startet sie ohne Adressleiste.
