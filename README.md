# Casa del Jefe — The Ultimate Hold’em Parlor v7 Strategy Preview

A self-contained static Ultimate Texas Hold’em app with full Play, Train, and Look Up modes.

## Included

- Full core-game Play mode with dealer cards, wagers, qualification, payouts, bankroll, and history.
- Exact optimal scoring in Play and Train.
- Accuracy is the percentage of complete hands played perfectly.
- Only the first strategic mistake in a hand is recorded.
- Train mode contains no dealer hand and ends at the first mistake.
- Exact 169-class preflop strategy map and blackjack-style chart.
- Exact flop lookup through the El Jefe human-readable rules plus 15,918 certified canonical exceptions.
- Exact river decisions calculated locally by enumerating all 990 possible dealer hands.
- Look Up reachability warnings for off-path flop decisions and exact answers for all river positions.
- El Jefe Strategy — Intermediate and Wizard of Odds Strategy — Beginner comparisons after the flop.
- El Jefe river strategy is deliberately labeled **in development** in this preview.

## Strategy data status

The preflop classes through K6o are from the completed certified production run. K7o–KQo and A2o–AKo are included as user-approved automatic 4x raises pending the final audit run.

## Run

Open `index.html` directly or serve the folder from any static web host. No server-side code or external dependencies are required.
