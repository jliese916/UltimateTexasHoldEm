# Casa del Jefe — The Ultimate Hold’em Parlor v10

A self-contained static Ultimate Texas Hold’em app with Play, Train, and Look Up modes.

## Version 10 changes

- Play session review contains Hands, Wins, Pushes, and Losses only.
- Play and Train store the first mistake as a visual card-and-board review item.
- Strategy mistakes are not announced on the Play table.
- Train shows the best play for each street reached after the hand.
- Train has a simplified table heading and statistics: Hands and Accuracy.
- Accuracy is the percentage of complete hands played perfectly.
- Green plus and red minus indicators show whether the latest hand was perfect.
- Look Up uses one progressive card-entry flow with a context-sensitive search button.
- Strategy guides use a dropdown for Preflop, Post-Flop, and River.
- The preflop chart is triangular, display-only, includes pairs, and uses larger action lettering.
- Look Up cards match the typography and proportions of the other Casa del Jefe trainers.
- User-facing technical certification language is omitted.

## Strategy behavior

- Preflop decisions use the complete starting-hand chart.
- Reachable post-flop decisions use the compact rule-plus-exception lookup.
- River decisions are calculated locally from all 990 possible dealer hands.
- Post-flop positions that cannot occur after the best preflop play are reported as unreachable.
- River positions still receive a recommendation even when an earlier decision was off the best path.

## Run

Open `index.html` directly or serve the folder from any static web host. No server-side code or external dependencies are required.
