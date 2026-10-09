# Lüfter

Ein Lüfter hält den Raspberry Pi kühl, etwa in einem geschlossenen Gehäuse oder bei einem Pi 4 oder 5 unter Last. Die Box regelt ihn nach der Temperatur: Je wärmer der Prozessor, desto schneller dreht er.

**Einstellungen › Akku & Strom › Lüfter**

| Einstellung | Wirkung | Nach der Installation |
| --- | --- | --- |
| **Lüfter aktiv** | schaltet die Regelung ein | aus |
| **Lüfter-Pin** | der GPIO-Pin, an dem der Lüfter hängt | 12 |
| **Volle Drehzahl (100 %) ab** | Temperatur für volle Leistung | 75 °C |
| **75 % ab** | Temperatur für 75 % | 65 °C |
| **50 % ab** | Temperatur für 50 % | 55 °C |
| **25 % ab** | Temperatur für 25 % | 45 °C |

Die Temperaturen lassen sich zwischen 20 und 90 °C einstellen. Sie müssen von 100 % nach 25 % kleiner werden. Mit **Speichern** übernimmst du alle Werte.

> [!NOTE]
> Der Lüfter braucht einen eigenen GPIO-Pin und darf ihn sich nicht mit anderem Zubehör teilen ([GPIO-Belegung](../anhang/gpio.md)). Wie warm die Box gerade ist, zeigt **Einstellungen › System › Zustand der Box** ([Protokolle und Zustand](../wartung/protokolle.md)).
