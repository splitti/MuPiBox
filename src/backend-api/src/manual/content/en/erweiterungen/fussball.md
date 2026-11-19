# Football

The extension **Football** shows on the display how **your clubs** played and when they play next, the matches of the **current matchday** and the **table**. It sets up nothing on the box; the box gets the results from the internet, from **OpenLigaDB** or, with a key of your own, from **football-data.org**.

There are no bets, no ads, no links to the internet and no pictures of players, only crests, names and numbers.

## Setting it up

1. Install the extension under **Settings › System › Extensions** ([Installing and managing](installieren.md)).
2. Open the details of its card and choose the **League**: its matchday and its table are on the display.
3. Under **My clubs**, search for a club. A tap on **＋ Name** follows it. Up to five clubs are possible, national teams like **Deutschland** (Germany) too.

The display then shows the tab **Football** (a ball) at the top. A tap on it opens the page with three buttons:

| View | What it shows |
| --- | --- |
| **My club** / **My clubs** | for each club the crest, the place in the table, the last match with its result and the next one with its day and time; while a match runs, the score stands large above. Several clubs stand one under the other |
| **Matchday** | all matches of the current matchday; the arrows or a swipe bring the matchday before and after. Your clubs are highlighted |
| **Table** | place, matches, goal difference and points; when it opens, your club is in the middle. A coloured line marks the places for promotion or the Champions League (green), the play-off (orange) and relegation (red). If your clubs play in different leagues, buttons above the table choose the league, say **1. Bundesliga** and **LaLiga**; a swipe does the same |

The **DFB Cup** has no table. Without a club there is no **My club** view.

A club's matches come from **every competition** the source knows: for Bayern the Bundesliga, the DFB Cup and the Champions League, for Germany internationals and tournaments. The box takes the place from the table of the league the club plays in. The tables of other leagues it fetches only while the page is open, at most hourly; a league of football-data.org needs the key. Cups, the Champions League and national teams have no table of their own.

## Settings

| Setting | Effect |
| --- | --- |
| **Source** | **OpenLigaDB** (free, no sign-up, mostly German leagues) or **football-data.org** (with a key, see below) |
| **League** | 1. Bundesliga, 2. Bundesliga, 3. Liga, DFB Cup or Women's Bundesliga |
| **Competition** and **API key** | only with football-data.org, see below |
| **My clubs** | search by name: **＋** follows a club, **✕** stops following it – so to stop, search for the club's name. With five clubs there is a **＋** again only after you removed one |
| **View when opening** | what the tab shows first |
| **Score in the header** | while a match of one of your clubs runs, the two crests and the score stand at the top of the display, several matches side by side; a tap on them opens the page (default: on) |
| **Announce goals** | when one of your clubs scores, the box says so with its voice, for example “Goal for Bremen! 2 to 1.”; music gets quieter meanwhile but does not stop (default: off) |
| **Requests** | whether the last request worked, and when it was |

> [!NOTE]
> During **quiet hours** and while the box is **blocked** (play time used up, a pause set by the parents) there is no announcement and no score in the header. The box announces at most once a minute and only after it has seen the match running: a goal from before is not announced after switching on. The display is not woken for it. How quickly the announcement comes depends on when the source enters the goal. If two goals fall shortly after each other, the second comes a minute later. The announcement needs the box's **Speech output** and speaks in its language. If the source takes a goal back and enters it again, the box announces it once more.

### Several users

When [several users](../bedienung/mehrere-benutzer.md) are switched on, **every user has their own league, clubs and view**. Above the form there is **Settings of** with a button for each user: that way you set a child's clubs without switching the box. The fields this applies to are marked **per user**. After a switch of the user, the display shows that user's clubs at once.

## Other leagues: football-data.org

For the big leagues of Europe there is the second source **football-data.org**: Premier League, Championship, Bundesliga, LaLiga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão, Champions League and the World and European Championships.

1. Sign up for free on [football-data.org](https://www.football-data.org) (“Register”). The key comes by e-mail.
2. Under **Source** choose football-data.org, enter the **API key** and tap **Save**. The key applies to the whole box; the app does not show it again.
3. Choose the **Competition**. Under **My clubs** you now find its clubs.

**Clubs from both sources:** a club stays with the source you followed it at. For Bayern, Germany and Barcelona, follow Bayern and Germany at OpenLigaDB, briefly set the source to football-data.org with the competition **LaLiga**, follow Barcelona and set the source back. League, matchday and table then come from OpenLigaDB again, Barcelona still from football-data.org. Barcelona needs the key for that.

> [!NOTE]
> The free tier of football-data.org gives the results **with a delay**. At the bottom of the page it then says **delayed**, and the goal announcement comes later too. The box stays below the limit of ten requests a minute there. Of a club at football-data.org it shows the matches of the three weeks before and after (ten days if football-data.org does not take that many).

## How often the box asks

The results are entered by the OpenLigaDB community, for the Bundesliga mostly a few minutes after the goal, for other leagues sometimes later.

- **Your clubs:** every minute while one of them plays (from shortly before the kick-off; at football-data.org every two minutes), every ten minutes while the page is open, else hourly.
- **The league's matchday and table:** with the page open every minute while a match runs, on a matchday otherwise every 15 minutes; with the page closed at most hourly.
- **No club chosen:** with the page closed the box does not ask at all.

If the source does not answer, the last values stay, and at the bottom it says **No connection to the source – last values**. The box then tries again at growing intervals of up to 30 minutes; a club it asks again after five minutes at most. The header shows a match only while the last answer is at most three minutes old.

At the bottom of the page it says where the data come from: **Data: OpenLigaDB (ODbL)** and, with football-data.org, **Football data provided by the Football-Data.org API**.

The box fetches the **crests** once and keeps them. The display never asks a server outside itself. If a crest is missing, a circle with the club's short name stands there.

## If nothing appears

- Is the extension switched on under **Settings › System › Extensions**?
- The results and the club search need the internet.
- During the summer break and between the rounds of the cup the matchday can be empty.
- The matches of a national team often appear at OpenLigaDB only shortly before: then it says **No match planned**.
