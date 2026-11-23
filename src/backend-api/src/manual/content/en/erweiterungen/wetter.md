# Weather

The extension **Weather** shows the weather of a place as **dials** on the display: temperature, humidity, wind speed, wind direction, air pressure and rainfall. It sets up nothing on the box; the box gets the values from the internet.

## Setting it up

1. Install the extension under **Settings › System › Extensions** ([Installing and managing](installieren.md)).
2. Open the details of its card and search for the name of your place under **Place**. Tap a result.

Once a place is chosen, the display shows the tab **Weather** at the top. A tap on it opens the dials: always two side by side, and a swipe brings the next ones. The back button in the title bar closes them again.

## Settings

| Setting | Effect |
| --- | --- |
| **Weather server** | **Open-Meteo** provides measured values of the last 24 hours and gusts. With **MET Norway (yr.no)** they are values of the weather model; the rain there is the forecast for the next 24 hours |
| **Place** | search for the name and tap a result |
| **Refresh every …** and **Unit** | how often the open weather view fetches new values, in seconds or minutes (every 10 seconds at least, default every 10 minutes) |
| **Temperature** | °C or °F |
| **Rain** | mm or inches |
| **Air pressure** | hPa, inHg, mb or kPa |
| **Wind speed** | km/h, m/s, mph or knots |
| **Order of the dials** | take a dial by its handle and move it to another place |

> [!NOTE]
> The weather servers provide new values only about once an hour, and the box asks them once a minute at most. A very short interval therefore does not make the view more accurate.

Both weather servers are free and need no account. The box asks them with the coordinates of the chosen place.

## If no weather appears

- Is a **place** chosen? Without one there is no **Weather** tab.
- The place search and the values need the internet.
- Is the extension switched on under **Settings › System › Extensions**?
