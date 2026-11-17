# NFC: Spoken messages

The sub page **Speech output** (**Settings › NFC extension › Speech output**) sets what the box **says with its voice** when something is in the way or missing. A child who lays on a tag and hears nothing does not know why.

Each message has a **switch** and a **text**. You can change the text; it is spoken as you write it (up to 300 characters). If you leave it empty or unchanged, the box speaks the default text **in the language it speaks** (Settings › Audio › Speech output, **The box speaks**). For languages without a default text of their own (Arabic, say) it is English.

The messages come from the **voice of the box** that you set under **Settings › Audio › Speech output**. If **Silent** is chosen there, NFC is silent too. If music is playing, it gets quieter meanwhile.

## The messages

| Card | Message | When |
| --- | --- | --- |
| **WLAN** | **No connection to the WiFi router** | A tag starts a medium that needs the internet and the box is not joined to any WiFi. |
| **WLAN** | **WiFi connection problem or sync error** | The box is on the router but cannot get to the internet. |
| **WLAN** | **WiFi signal is there, but too weak** | The signal is weaker than -75 dBm. The medium starts anyway. |
| **Content** | **Delay or interruption while loading the content** | The medium of a tag does not start: after 10 seconds, with Spotify after 35. |
| **Content** | **NAS temporarily not reachable** | A tag with a medium from the NAS does not start and the NAS does not answer. |
| **Content** | **Spotify temporarily not reachable** | A tag with a Spotify medium does not start and Spotify does not answer. |
| **Tags and battery** | **NFC tag not assigned yet** | A tag that has no medium yet is laid on. |
| **Tags and battery** | **Please plug in to charge** | By itself when the battery reaches **10 %** and the box is not charging. |

The default texts (English):

| Message | Text |
| --- | --- |
| No connection to the WiFi router | I have no connection to the WiFi router. |
| WiFi connection problem or sync error | There is a problem with the WiFi connection or with syncing. |
| WiFi signal is there, but too weak | There is a WiFi signal, but it is too weak. Please move me closer to the router. |
| Delay or interruption while loading the content | Loading the content is taking too long or was interrupted. Please try again in a moment. |
| NAS temporarily not reachable | The NAS is temporarily not reachable. |
| Spotify temporarily not reachable | Spotify is temporarily not reachable. |
| NFC tag not assigned yet | This NFC tag has not been assigned yet. |
| Please plug in to charge | Please plug me in to charge. |

## How often, and when not

- The same message comes **at most every two minutes**, so that a fault that stays does not make the box talk without end. Two different messages do not talk over each other.
- **Exception: NFC tag not assigned yet.** This message comes **every time** the tag is laid on, even if you lay it on again at once. Only while the sentence is still being said is a new lay-on skipped.
- An album from the **SD card** needs no network: no WiFi message comes for its medium.
- **Delay or interruption** does not come when the box blocks the medium itself (today's playing time is over, it is a quiet time), and not when the tag is taken off again and **When taken off** pauses or stops.
- The message **Please plug in to charge** comes **once**. Only after the battery was above 15 % again or the box was charged does it come again at the next 10 %. It needs a MuPiBox HAT with a battery; without a battery (mains power) there is none.
- The box checks the WiFi by the file it writes itself every few seconds (name of the network, address, internet yes or no, signal strength). A box on a LAN cable counts as connected.

## Back to the default texts

Delete the text of a message and save: the box takes the default text again. The switch of a message turns it off altogether.

Next: [NFC extension](nfc.md), [Assigned tags](nfc-zugeordnete-tags.md).
