"use strict";

(function exposeUltimateHoldemEngine(root) {
  const RANK_LABELS = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "10", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  const SUITS = ["♥", "♦", "♣", "♠"];
  const SUIT_NAMES = ["hearts", "diamonds", "clubs", "spades"];
  const CATEGORY_NAMES = ["High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];

  function createDeck() {
    const deck = [];
    for (let suit = 0; suit < 4; suit += 1) {
      for (let rank = 2; rank <= 14; rank += 1) deck.push({ rank, suit });
    }
    return deck;
  }

  function shuffledDeck(random = Math.random) {
    const deck = createDeck();
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function labelCard(card) {
    return `${RANK_LABELS[card.rank]} of ${SUIT_NAMES[card.suit]}`;
  }

  function compareScore(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
  }

  function straightHigh(ranks) {
    const unique = [...new Set(ranks)].sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);
    for (let i = 0; i <= unique.length - 5; i += 1) {
      if (unique[i] - unique[i + 4] === 4) return unique[i];
    }
    return 0;
  }

  function evaluateFive(cards) {
    if (!Array.isArray(cards) || cards.length !== 5) throw new Error("evaluateFive requires exactly five cards.");
    const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
    const counts = new Map();
    ranks.forEach(rank => counts.set(rank, (counts.get(rank) || 0) + 1));
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every(card => card.suit === cards[0].suit);
    const highStraight = straightHigh(ranks);

    let score;
    if (flush && highStraight) score = [8, highStraight];
    else if (groups[0][1] === 4) score = [7, groups[0][0], groups[1][0]];
    else if (groups[0][1] === 3 && groups[1][1] === 2) score = [6, groups[0][0], groups[1][0]];
    else if (flush) score = [5, ...ranks];
    else if (highStraight) score = [4, highStraight];
    else if (groups[0][1] === 3) {
      const kickers = groups.filter(group => group[1] === 1).map(group => group[0]).sort((a, b) => b - a);
      score = [3, groups[0][0], ...kickers];
    } else if (groups[0][1] === 2 && groups[1][1] === 2) {
      const pairs = groups.filter(group => group[1] === 2).map(group => group[0]).sort((a, b) => b - a);
      const kicker = groups.find(group => group[1] === 1)[0];
      score = [2, ...pairs, kicker];
    } else if (groups[0][1] === 2) {
      const pair = groups[0][0];
      const kickers = groups.filter(group => group[1] === 1).map(group => group[0]).sort((a, b) => b - a);
      score = [1, pair, ...kickers];
    } else score = [0, ...ranks];

    const category = score[0];
    const royal = category === 8 && score[1] === 14 && ranks.includes(10);
    return {
      score,
      category,
      name: royal ? "Royal Flush" : CATEGORY_NAMES[category],
      cards: cards.slice()
    };
  }

  function evaluateSeven(cards) {
    if (!Array.isArray(cards) || cards.length !== 7) throw new Error("evaluateSeven requires exactly seven cards.");
    let best = null;
    for (let a = 0; a < 3; a += 1) {
      for (let b = a + 1; b < 4; b += 1) {
        for (let c = b + 1; c < 5; c += 1) {
          for (let d = c + 1; d < 6; d += 1) {
            for (let e = d + 1; e < 7; e += 1) {
              const current = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!best || compareScore(current.score, best.score) > 0) best = current;
            }
          }
        }
      }
    }
    return best;
  }

  function compareEvaluations(player, dealer) {
    return compareScore(player.score, dealer.score);
  }

  function blindPayoutOdds(evaluation) {
    if (evaluation.name === "Royal Flush") return 500;
    if (evaluation.category === 8) return 50;
    if (evaluation.category === 7) return 10;
    if (evaluation.category === 6) return 3;
    if (evaluation.category === 5) return 1.5;
    if (evaluation.category === 4) return 1;
    return 0;
  }

  function settleHand({ playerCards, dealerCards, board, playMultiplier }) {
    if (![1, 2, 3, 4].includes(playMultiplier)) throw new Error("Play multiplier must be 1, 2, 3, or 4.");
    const player = evaluateSeven([...playerCards, ...board]);
    const dealer = evaluateSeven([...dealerCards, ...board]);
    const comparison = compareEvaluations(player, dealer);
    const dealerQualifies = dealer.category >= 1;
    const totalStake = 2 + playMultiplier;
    let returned = 0;
    let winner = "tie";
    let blindOdds = 0;

    if (comparison > 0) {
      winner = "player";
      returned += playMultiplier * 2;
      returned += dealerQualifies ? 2 : 1;
      blindOdds = blindPayoutOdds(player);
      returned += blindOdds > 0 ? 1 + blindOdds : 1;
    } else if (comparison < 0) {
      winner = "dealer";
      returned += dealerQualifies ? 0 : 1;
    } else {
      returned = totalStake;
    }

    return {
      player,
      dealer,
      winner,
      dealerQualifies,
      blindOdds,
      totalStake,
      returned,
      net: returned - totalStake
    };
  }

  const api = {
    RANK_LABELS,
    SUITS,
    SUIT_NAMES,
    CATEGORY_NAMES,
    createDeck,
    shuffledDeck,
    labelCard,
    evaluateFive,
    evaluateSeven,
    compareEvaluations,
    blindPayoutOdds,
    settleHand
  };

  root.UltimateHoldemEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
