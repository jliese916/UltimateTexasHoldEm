# Casa del Jefe — The Ultimate Hold’em Parlor v5

A self-contained static browser app matching the visual language of the Casa del Jefe Let It Ride trainer.

## Included in this build

- Core Ultimate Texas Hold’em gameplay only; no side bets.
- Equal 1-unit Ante and Blind wagers placed when a hand is dealt.
- Preflop Check, Raise 3x, and Raise 4x actions.
- Flop Check and Raise 2x actions.
- River Fold and Call 1x actions.
- Keyboard shortcuts shown directly on the action buttons: C, 3, 4, 2, F, and 1.
- Dealer qualification, Ante/Play settlement, and the standard Blind paytable.
- Balance tracking, session history chart, and session reset.
- Accuracy displayed as NA until optimal strategy scoring is available.
- Train and Look Up tabs retained as under-construction panels.
- El Jefe Challenge button retained as a deliberately nonfunctional control.

Open `index.html` directly, or serve the folder from a static web host.


Version 3 replaces the simple sequential reveals with a quick live-dealer window-card animation: the flop fans from a three-card packet on the right, while the turn/river and dealer hand fan from two-card packets.

Version 4 keeps the red dealer and yellow community outlines fixed on the felt during all deal animations, uses one clean colored outline per slot, and shortens the table labels to Dealer, Community, and Player.


Version 5 isolates each reveal packet so only the cards currently being dealt are replaced or animated. Dealer cards, unrevealed board cards, prior community cards, and player cards keep their original DOM nodes and remain visually fixed until their own action.


## v6 consistency update
- Standardized Bankroll History and Session Review panels.
- Added win/push/loss tracking with saved-session migration.
- Added mobile-safe chart rendering and user-controlled update notices.
- Optimal-play comparison remains intentionally pending until the strategy dataset is complete.
