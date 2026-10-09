# Fan

A fan keeps the Raspberry Pi cool, for example in a closed case or with a Pi 4 or 5 under load. The box controls it by temperature: the warmer the processor, the faster it spins.

**Settings › Battery & Power › Fan**

| Setting | Effect | After installation |
| --- | --- | --- |
| **Fan active** | switches the control on | off |
| **Fan pin** | the GPIO pin the fan is connected to | 12 |
| **Full speed (100%) from** | temperature for full power | 75 °C |
| **75% from** | temperature for 75 % | 65 °C |
| **50% from** | temperature for 50 % | 55 °C |
| **25% from** | temperature for 25 % | 45 °C |

The temperatures can be set between 20 and 90 °C. They must get lower from 100 % to 25 %. **Save** applies all values.

> [!NOTE]
> The fan needs a GPIO pin of its own and must not share it with other accessories ([GPIO assignment](../anhang/gpio.md)). How warm the box currently is is shown under **Settings › System › Box health** ([Logs and status](../wartung/protokolle.md)).
