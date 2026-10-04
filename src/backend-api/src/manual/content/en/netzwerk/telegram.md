# Telegram

The **parent bot** connects the box with Telegram. It sends you messages and lets you operate the box from away within the limits of your home network. Everything is under **Settings › Services › Telegram**.

## Setting up

1. In Telegram, create a bot of your own with **BotFather**. You get a **token**.
2. Enter the token in the app under **Set new token**. An empty field leaves the existing token unchanged.
3. Switch on **Bot active**.
4. Under **Allowed chats** enter your **chat ID** and a name. You find the chat ID with the **Find chat ID** button.

**Only the allowed chats may control the box.** Groups have negative IDs (for example −100…). Changes restart the Telegram service.

> [!WARNING]
> Do not give the token to anyone, and only add chats you trust the box to. Whoever has an allowed chat can operate the box.

## What the bot reports

| Setting | Effect |
| --- | --- |
| **Report playback** | **off**: only what is important (listening time used up, quiet time, battery almost empty, start and shutdown). **On**: additionally every track with a screenshot, pause, stop and continue |
| **Weekly summary** | on Sunday evening: how long and what was listened to during the week |

When switching off, the message also says why: empty battery, too long without playback (idle) or a normal shutdown.

## Signing in with a link

The bot can send you a **link** that signs you in to the app, even without a password ([Opening the app and signing in](../erste-schritte/app-oeffnen.md)).

## Language

The bot's texts follow the **box language** (**Settings › System › Language**).
