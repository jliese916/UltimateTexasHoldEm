# v7 Strategy Preview — Build Notes

## Implemented

- Play mode with exact optimal-path scoring and first-mistake tracking.
- Train mode with no dealer cards and exact decision scoring.
- Look Up mode with preflop, flop, and river card entry.
- Exact preflop map and 13×13 chart.
- Exact flop lookup using Improved Flop Strategy V1 plus 15,918 canonical exceptions.
- Exact river lookup by local enumeration of all 990 dealer hands.
- Wizard beginner strategy comparison on flop and river.
- El Jefe intermediate flop strategy comparison.
- El Jefe intermediate river strategy marked in development.

## Validation completed

- Strategy data generation reproduced all 794,240 exact flop actions with zero mismatches.
- A separate browser-side audit checked 10,000 sampled flop states with zero mismatches.
- The river calculator reproduced the known 72o board-quads state:
  - 91 player wins, 45 ties, 854 losses
  - Call EV = -1.484848...
  - Fold EV = -2
  - 28 one-card dealer outs beat the player
- Play, Train, preflop Look Up, exact flop exception Look Up, and exact river Look Up were exercised in Chromium.

## Pending

- Final El Jefe intermediate river strategy.
- Final certification audit of the user-approved automatic preflop raises K7o–KQo and A2o–AKo.
- Challenge mode.
