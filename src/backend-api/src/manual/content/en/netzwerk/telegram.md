# Telegram

The **parent bot** connects the box with Telegram. It sends you messages and lets you operate the box from away too. Everything is under **Settings › Services › Telegram**.

## Setting up

1. In Telegram, create a bot of your own with **BotFather** (`/newbot`). You get a **token**.
2. Enter the token in the app under **Bot token** and tap **Save**. If a token is already set up, **Change** opens the field **New token**.
3. Under **Allowed chats** enter your **Chat ID** and a **Name** and tap **Add**. You find the chat ID with **Find chat ID**: then write the bot a message in Telegram; the box waits up to 40 seconds for it.
4. Switch on **Bot active** and tap **Save**.
5. With **Send test message** you check that everything arrives.

**Only the allowed chats may control the box.** Groups have negative IDs (for example −100…). Changes only apply with **Save**; the Telegram service restarts then. The **Commands** card shows the bot's most important commands.

> [!WARNING]
> Do not give the token to anyone, and only add chats you trust the box to. Whoever has an allowed chat can operate the box.

## What the bot reports

| Setting | Effect |
| --- | --- |
| **Report playback** | **off**: only what is important (listening time used up, quiet time, battery almost empty, start and shutdown). **On**: additionally every track with a screenshot, pause, stop and continue. That is usually too much |
| **Weekly summary** | on Sunday evening: how long and what was listened to during the week |

When switching off, the message also says why: empty battery, too long without playback (idle) or a normal shutdown.

## Photo time

When the [photo display](../fotos/index.md) is on, `/status` also tells today's **photo time**: how long photos were looked at, and with a limit of its own, how much is left. If the photo time has a limit of its own ([Photo time](../fotos/bildzeit.md)), two commands go with it, also as buttons under `/help`:

| Command | Effect |
| --- | --- |
| `/photoextend 10` | 10 more minutes of photo time today (10 without a number) |
| `/photofree` | no photo time limit today |

Both hold for today only, as **+10 min** and **Free today** in the app.

## Tiles with a day's limit

When single tiles have a limit per day of their own ([Tiles with a day's limit](../spielzeit/kachel-limit.md)), `/status` tells them with today's minutes. `/tiles` (also the button **Tiles with a limit** under `/help`) shows them with two buttons each: **+10** gives the tile 10 more minutes today, **free** lifts its limit for today.

## Several users

With [several users](../bedienung/mehrere-benutzer.md) on, a **name at the end** of a command means that child; without a name the command is for the active one. This works with `/status`, `/extend`, `/photoextend`, `/photofree`, `/tiles` and `/limit set`, for example `/status Leni` or `/extend 30 Leni`. For a child who is not listening right now, `/status` gives their day so far. Bonus minutes count as soon as that child's turn comes. `/release` and `/quietnow` hold for the whole box. The weekly summary comes for each child separately.

## Signing in with a link

With `/login` the bot sends you a **link** that signs you in to the app, even without a password ([Opening the app and signing in](../erste-schritte/app-oeffnen.md)).

## Language

The bot speaks **German** if the **Box language** (**Settings › System › Language**) is German. With any other language it speaks **English**.
