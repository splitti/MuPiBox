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

## Signing in with a link

With `/login` the bot sends you a **link** that signs you in to the app, even without a password ([Opening the app and signing in](../erste-schritte/app-oeffnen.md)).

## Language

The bot speaks **German** if the **Box language** (**Settings › System › Language**) is German. With any other language it speaks **English**.
