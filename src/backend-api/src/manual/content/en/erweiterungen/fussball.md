# Football

The extension **Football** shows on the display how **your club** played and when it plays next, the matches of the **current matchday** and the **table**. It sets up nothing on the box; the box gets the results from the internet, from **OpenLigaDB**.

There are no bets, no ads, no links to the internet and no pictures of players, only crests, names and numbers.

## Setting it up

1. Install the extension under **Settings › System › Extensions** ([Installing and managing](installieren.md)).
2. Open the details of its card and choose the **League**.
3. Under **Favourite club**, search for the name of the club and tap it.

The display then shows the tab **Football** (a ball) at the top. A tap on it opens the page with three buttons:

| View | What it shows |
| --- | --- |
| **My club** | the crest, the place in the table, the last match with its result and the next one with its day and time; while a match runs, the score stands large in the middle |
| **Matchday** | all matches of the current matchday; the arrows or a swipe bring the matchday before and after. Your club is highlighted |
| **Table** | place, matches, goal difference and points; when it opens, your club is in the middle. A coloured line marks the places for promotion or the Champions League (green), the play-off (orange) and relegation (red) |

The **DFB Cup** has no table. Without a favourite club there is no **My club** view.

## Settings

| Setting | Effect |
| --- | --- |
| **League** | 1. Bundesliga, 2. Bundesliga, 3. Liga, DFB Cup or Women's Bundesliga |
| **Favourite club** | search for the name and tap the club; **No club** takes it away again |
| **View when opening** | what the tab shows first |
| **Requests** | whether the last request worked, and when it was |

### Several users

When [several users](../bedienung/mehrere-benutzer.md) are switched on, **every user has their own league, club and view**. Above the form there is **Settings of** with a button for each user: that way you set a child's club without switching the box. The fields this applies to are marked **per user**. After a switch of the user, the display shows that user's club at once.

## How often the box asks

The results are entered by the OpenLigaDB community, for the Bundesliga mostly a few minutes after the goal, for other leagues sometimes later.

- **Page open:** while a match runs, the box asks every minute; on a matchday otherwise every 15 minutes, else hourly.
- **Page closed, club chosen:** the box asks only for the club's matches: every minute while it plays, every 15 minutes on the day of its match, else hourly.
- **No club chosen:** with the page closed the box does not ask at all.

If OpenLigaDB does not answer, the last values stay, and at the bottom it says **No connection to the source – last values**. The box then tries again at growing intervals of up to 30 minutes.

The box fetches the **crests** once and keeps them. The display never asks a server outside itself. If a crest is missing, a circle with the club's short name stands there.

## If nothing appears

- Is the extension switched on under **Settings › System › Extensions**?
- The results and the club search need the internet.
- During the summer break and between the rounds of the cup the matchday can be empty.
