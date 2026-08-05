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

  function cardId(card) {
    return card.suit * 13 + (card.rank - 1);
  }

  function cardFromId(id) {
    const value = Number(id);
    if (!Number.isInteger(value) || value < 1 || value > 52) throw new Error("Card id must be an integer from 1 through 52.");
    return { suit: Math.floor((value - 1) / 13), rank: ((value - 1) % 13) + 2 };
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
      score = [2, ...pairs, kicker, 0, 0];
    } else if (groups[0][1] === 2) {
      const pair = groups[0][0];
      const kickers = groups.filter(group => group[1] === 1).map(group => group[0]).sort((a, b) => b - a);
      score = [1, pair, ...kickers, 0];
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

  function evaluateBest(cards) {
    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) throw new Error("evaluateBest requires five, six, or seven cards.");
    if (cards.length === 5) return evaluateFive(cards);
    let best = null;
    const n = cards.length;
    for (let a = 0; a < n - 4; a += 1) {
      for (let b = a + 1; b < n - 3; b += 1) {
        for (let c = b + 1; c < n - 2; c += 1) {
          for (let d = c + 1; d < n - 1; d += 1) {
            for (let e = d + 1; e < n; e += 1) {
              const current = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!best || compareScore(current.score, best.score) > 0) best = current;
            }
          }
        }
      }
    }
    return best;
  }

  function evaluateSeven(cards) {
    if (!Array.isArray(cards) || cards.length !== 7) throw new Error("evaluateSeven requires exactly seven cards.");
    return evaluateBest(cards);
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

  function blindPayoutHalfUnits(evaluation) {
    if (evaluation.name === "Royal Flush") return 1000;
    if (evaluation.category === 8) return 100;
    if (evaluation.category === 7) return 20;
    if (evaluation.category === 6) return 6;
    if (evaluation.category === 5) return 3;
    if (evaluation.category === 4) return 2;
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

  function remainingDeck(knownCards) {
    const used = new Set(knownCards.map(cardId));
    return createDeck().filter(card => !used.has(cardId(card)));
  }

  function riverDecision(playerCards, board) {
    if (!Array.isArray(playerCards) || playerCards.length !== 2 || !Array.isArray(board) || board.length !== 5) {
      throw new Error("riverDecision requires two player cards and five board cards.");
    }
    const player = evaluateSeven([...playerCards, ...board]);
    const remaining = remainingDeck([...playerCards, ...board]);
    let totalProfitHalfUnits = 0;
    let wins = 0;
    let ties = 0;
    let losses = 0;
    const blindWinHalfUnits = blindPayoutHalfUnits(player);

    for (let i = 0; i < remaining.length - 1; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const dealer = evaluateSeven([remaining[i], remaining[j], ...board]);
        const comparison = compareEvaluations(player, dealer);
        if (comparison > 0) {
          wins += 1;
          const ante = dealer.category >= 1 ? 2 : 0;
          totalProfitHalfUnits += ante + blindWinHalfUnits + 2;
        } else if (comparison < 0) {
          losses += 1;
          const ante = dealer.category >= 1 ? -2 : 0;
          totalProfitHalfUnits += ante - 2 - 2;
        } else {
          ties += 1;
        }
      }
    }

    const combinations = wins + ties + losses;
    const foldTotalHalfUnits = -4 * combinations;
    const comparison = Math.sign(totalProfitHalfUnits - foldTotalHalfUnits);
    return {
      action: comparison >= 0 ? "call1" : "fold",
      acceptableActions: comparison === 0 ? ["call1", "fold"] : [comparison > 0 ? "call1" : "fold"],
      indifferent: comparison === 0,
      callEV: totalProfitHalfUnits / (2 * combinations),
      foldEV: -2,
      margin: (totalProfitHalfUnits - foldTotalHalfUnits) / (2 * combinations),
      wins,
      ties,
      losses,
      combinations,
      player
    };
  }

  function oneCardOuts(playerCards, board) {
    if (!Array.isArray(playerCards) || playerCards.length !== 2 || !Array.isArray(board) || board.length !== 5) {
      throw new Error("oneCardOuts requires two player cards and five board cards.");
    }
    const player = evaluateSeven([...playerCards, ...board]);
    const remaining = remainingDeck([...playerCards, ...board]);
    let beats = 0;
    let ties = 0;
    let loses = 0;
    for (const card of remaining) {
      const dealer = evaluateBest([card, ...board]);
      const comparison = compareEvaluations(dealer, player);
      if (comparison > 0) beats += 1;
      else if (comparison === 0) ties += 1;
      else loses += 1;
    }
    return { beats, ties, loses, total: remaining.length, player };
  }

  const api = {
    RANK_LABELS,
    SUITS,
    SUIT_NAMES,
    CATEGORY_NAMES,
    createDeck,
    shuffledDeck,
    cardId,
    cardFromId,
    labelCard,
    evaluateFive,
    evaluateBest,
    evaluateSeven,
    compareScore,
    compareEvaluations,
    blindPayoutOdds,
    settleHand,
    remainingDeck,
    riverDecision,
    oneCardOuts
  };

  root.UltimateHoldemEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
