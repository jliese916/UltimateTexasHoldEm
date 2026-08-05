"use strict";

(() => {
  const APP_VERSION = "19";
  const E = window.UltimateHoldemEngine;
  const D = window.UTHStrategyData;
  if (!E) throw new Error("UltimateHoldemEngine did not load.");
  if (!D) throw new Error("UTHStrategyData did not load.");

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const PLAY_STORAGE_KEY = "casaUltimateHoldemPlayV2";
  const TRAIN_STORAGE_KEY = "casaUltimateHoldemTrainV2";
  const LEGACY_TRAIN_STORAGE_KEY = "casaUltimateHoldemTrainV1";
  const SUIT_CLASSES = ["suit-hearts", "suit-diamonds", "suit-clubs", "suit-spades"];
  const RANK_CHARS = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  const CHART_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const ACTION_LABELS = {
    check: "Check",
    raise4: "Raise 4x",
    raise2: "Raise 2x",
    call1: "Call 1x",
    fold: "Fold"
  };
  const STREET_LABELS = { preflop: "Preflop", flop: "Flop", river: "River" };
  const TRAIN_STRATEGIES = Object.freeze({
    optimal: { label: "Optimal Play", recapLabel: "Optimal" },
    jefe: { label: "El Jefe Strategy", recapLabel: "El Jefe" },
    wizard: { label: "Wizard of Odds Strategy", recapLabel: "Wizard of Odds" }
  });
  const WINDOW_PAUSE = 78;
  const DEAL_SLIDE_DURATION = 175;
  const DEAL_SETTLE_DELAY = 18;

  const exceptionKeys = new Set();
  for (let index = 0; index < D.flopExceptionPairs.length; index += 2) {
    exceptionKeys.add(`${D.flopExceptionPairs[index]}:${D.flopExceptionPairs[index + 1]}`);
  }
  const riverCache = new Map();
  const oneCardOutCache = new Map();

  const el = {
    tabs: $$(".mode-tab"),
    panels: { play: $("#playPanel"), train: $("#trainPanel"), lookup: $("#lookupPanel") },
    playBalance: $("#playBalance"),
    playAccuracy: $("#playAccuracy"),
    playDecisionIndicator: $("#playDecisionIndicator"),
    playDealer: $("#playDealer"),
    playCommunity: $("#playCommunity"),
    playPlayer: $("#playPlayer"),
    anteChips: $("#anteChips"),
    blindChips: $("#blindChips"),
    playChips: $("#playChips"),
    playMessage: $("#playMessage"),
    playActions: $("#playActions"),
    playDeal: $("#playDeal"),
    playChart: $("#playBalanceChart"),
    playDeltaSummary: $("#playDeltaSummary"),
    completedHands: $("#completedHands"),
    playWins: $("#playWins"),
    playPushes: $("#playPushes"),
    playLosses: $("#playLosses"),
    playMistakeSummary: $("#playMistakeSummary"),
    playMistakeList: $("#playMistakeList"),
    resetPlay: $("#resetPlay"),

    trainStrategy: $("#trainStrategy"),
    trainHands: $("#trainHands"),
    trainAccuracy: $("#trainAccuracy"),
    trainDecisionIndicator: $("#trainDecisionIndicator"),
    trainCommunity: $("#trainCommunity"),
    trainPlayer: $("#trainPlayer"),
    trainMessage: $("#trainMessage"),
    trainFeedback: $("#trainFeedback"),
    trainActions: $("#trainActions"),
    trainDeal: $("#trainDeal"),
    trainMistakeSummary: $("#trainMistakeSummary"),
    trainMistakeList: $("#trainMistakeList"),
    resetTrain: $("#resetTrain"),

    lookupBoardGroup: $("#lookupBoardGroup"),
    lookupBoardHelp: $("#lookupBoardHelp"),
    lookupPlayerSlots: $("#lookupPlayerSlots"),
    lookupBoardSlots: $("#lookupBoardSlots"),
    lookupPickerLabel: $("#lookupPickerLabel"),
    lookupRankPicker: $("#lookupRankPicker"),
    lookupSuitPicker: $("#lookupSuitPicker"),
    lookupRemove: $("#lookupRemove"),
    lookupClear: $("#lookupClear"),
    lookupSearch: $("#lookupSearch"),
    lookupMessage: $("#lookupMessage"),
    lookupResult: $("#lookupResult"),
    lookupStrategyResults: $("#lookupStrategyResults"),
    preflopChartContainer: $("#preflopChartContainer"),

    challengeLaunch: $("#challengeLaunch"),
    challengePanel: $("#challengePanel"),
    challengeGame: $("#challengeGame"),
    challengeProgress: $("#challengeProgress"),
    challengeExit: $("#challengeExit"),
    challengeCommunity: $("#challengeCommunity"),
    challengePlayer: $("#challengePlayer"),
    challengeMessage: $("#challengeMessage"),
    challengeActions: $("#challengeActions"),
    challengeSummary: $("#challengeSummary"),
    modeTabs: $("#modeTabs"),

    updateNotice: $("#updateNotice"),
    reloadUpdate: $("#reloadUpdate")
  };

  let balanceChartFrame = 0;
  let lastBalanceChartSignature = "";

  const state = {
    mode: "play",
    play: loadPlay(),
    train: loadTrain(),
    lookup: {
      cards: Array(7).fill(null),
      activeSlot: 0,
      pendingRank: null,
      resultSignature: null
    },
    challenge: {
      active: false,
      finished: false,
      completedHands: 0,
      correct: 0,
      misses: [],
      round: null
    }
  };

  function emptyPlay() {
    return { balance: 0, hands: 0, perfectHands: 0, wins: 0, pushes: 0, losses: 0, history: [0], mistakes: [], round: null };
  }

  function emptyTrainSession() {
    return { hands: 0, perfectHands: 0, errors: { preflop: 0, flop: 0, river: 0 }, mistakes: [] };
  }

  function emptyTrain() {
    return {
      strategy: "optimal",
      sessions: {
        optimal: emptyTrainSession(),
        jefe: emptyTrainSession(),
        wizard: emptyTrainSession()
      },
      round: null
    };
  }

  function normalizeTrainSession(saved) {
    const base = emptyTrainSession();
    if (!saved || typeof saved !== "object") return base;
    return {
      hands: Number(saved.hands) || 0,
      perfectHands: Number(saved.perfectHands) || 0,
      errors: {
        preflop: Number(saved.errors && saved.errors.preflop) || 0,
        flop: Number(saved.errors && saved.errors.flop) || 0,
        river: Number(saved.errors && saved.errors.river) || 0
      },
      mistakes: Array.isArray(saved.mistakes) ? saved.mistakes.slice(-25) : []
    };
  }

  function trainSession(strategy = state.train.strategy) {
    return state.train.sessions[strategy] || state.train.sessions.optimal;
  }

  function loadPlay() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAY_STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return emptyPlay();
      return {
        ...emptyPlay(),
        balance: Number(saved.balance) || 0,
        hands: Number(saved.hands) || 0,
        perfectHands: Number(saved.perfectHands) || 0,
        wins: Number(saved.wins) || 0,
        pushes: Number(saved.pushes) || 0,
        losses: Number(saved.losses) || 0,
        history: Array.isArray(saved.history) && saved.history.length ? saved.history.map(Number) : [0],
        mistakes: Array.isArray(saved.mistakes) ? saved.mistakes.slice(-25) : []
      };
    } catch (error) {
      console.warn("Could not load Ultimate Hold'em play session.", error);
      return emptyPlay();
    }
  }

  function loadTrain() {
    try {
      const saved = JSON.parse(localStorage.getItem(TRAIN_STORAGE_KEY) || "null");
      if (saved && typeof saved === "object" && saved.sessions) {
        const strategy = Object.prototype.hasOwnProperty.call(TRAIN_STRATEGIES, saved.strategy) ? saved.strategy : "optimal";
        return {
          strategy,
          sessions: {
            optimal: normalizeTrainSession(saved.sessions.optimal),
            jefe: normalizeTrainSession(saved.sessions.jefe),
            wizard: normalizeTrainSession(saved.sessions.wizard)
          },
          round: null
        };
      }
      const legacy = JSON.parse(localStorage.getItem(LEGACY_TRAIN_STORAGE_KEY) || "null");
      const migrated = emptyTrain();
      if (legacy && typeof legacy === "object") migrated.sessions.optimal = normalizeTrainSession(legacy);
      return migrated;
    } catch (error) {
      console.warn("Could not load Ultimate Hold'em training session.", error);
      return emptyTrain();
    }
  }

  function savePlay() {
    try {
      localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({
        balance: state.play.balance,
        hands: state.play.hands,
        perfectHands: state.play.perfectHands,
        wins: state.play.wins,
        pushes: state.play.pushes,
        losses: state.play.losses,
        history: state.play.history.slice(-301),
        mistakes: state.play.mistakes.slice(-25)
      }));
    } catch (error) {
      console.warn("Could not save Ultimate Hold'em play session.", error);
    }
  }

  function saveTrain() {
    try {
      localStorage.setItem(TRAIN_STORAGE_KEY, JSON.stringify({
        strategy: state.train.strategy,
        sessions: {
          optimal: trainSession("optimal"),
          jefe: trainSession("jefe"),
          wizard: trainSession("wizard")
        }
      }));
      localStorage.removeItem(LEGACY_TRAIN_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not save Ultimate Hold'em training session.", error);
    }
  }

  function formatNumber(value, digits = 1) {
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return value.toFixed(digits).replace(/\.0+$/, "");
  }

  function formatUnits(value, signed = false) {
    const sign = signed && value > 0 ? "+" : "";
    return `${sign}${formatNumber(value)} ${Math.abs(value) === 1 ? "unit" : "units"}`;
  }

  function formatPercent(numerator, denominator) {
    if (!denominator) return "NA";
    return `${(100 * numerator / denominator).toFixed(1)}%`;
  }

  function cardElement(card, { back = false, placeholder = false, revealing = false } = {}) {
    const node = document.createElement("div");
    node.className = `card${back ? " card-back" : ""}${placeholder ? " placeholder" : ""}${revealing ? " card-revealing" : ""}`;
    if (placeholder) {
      node.setAttribute("aria-label", "Empty card slot");
    } else if (back) {
      node.setAttribute("aria-label", "Face-down card");
    } else {
      const suitClass = SUIT_CLASSES[card.suit];
      node.classList.add(suitClass);
      node.innerHTML = `<span class="card-suit card-suit-top ${suitClass}">${E.SUITS[card.suit]}</span><span class="card-rank ${suitClass}">${E.RANK_LABELS[card.rank]}</span><span class="card-suit card-suit-bottom ${suitClass}">${E.SUITS[card.suit]}</span>`;
      node.setAttribute("aria-label", E.labelCard(card));
    }
    return node;
  }

  function renderCardRow(container, cards, visibleCount, totalCount) {
    container.replaceChildren();
    for (let index = 0; index < totalCount; index += 1) {
      const card = cards && cards[index];
      if (!card) container.append(cardElement(null, { placeholder: true }));
      else container.append(cardElement(card, { back: index >= visibleCount }));
    }
  }

  function mappedBoardCards(board) {
    return board ? [board[3], board[4], board[0], board[1], board[2]] : null;
  }

  function framedCardSlot(cardNode, slotClass) {
    const slot = document.createElement("div");
    slot.className = `uth-card-slot ${slotClass}`;
    slot.append(cardNode);
    return slot;
  }

  function renderDealerRow(round) {
    const cards = round && round.dealerCards;
    const visibleCount = round ? round.dealerVisible : 0;
    const hiddenSlots = new Set(round ? round.dealerHiddenSlots : []);
    el.playDealer.replaceChildren();
    for (let index = 0; index < 2; index += 1) {
      const card = cards && cards[index];
      const node = !card ? cardElement(null, { placeholder: true }) : cardElement(card, { back: index >= visibleCount });
      if (hiddenSlots.has(index)) node.classList.add("uth-deal-hidden");
      el.playDealer.append(framedCardSlot(node, "uth-dealer-slot"));
    }
  }

  function renderCommunityRow(container, round, training = false) {
    const cards = mappedBoardCards(round && round.board);
    const boardVisible = round ? round.boardVisible : 0;
    const visibleSlots = new Set(boardVisible >= 5 ? [0, 1, 2, 3, 4] : boardVisible >= 3 ? [2, 3, 4] : []);
    const hiddenSlots = new Set(!training && round ? round.boardHiddenSlots : []);
    container.replaceChildren();
    for (let index = 0; index < 5; index += 1) {
      const card = cards && cards[index];
      const node = !card ? cardElement(null, { placeholder: true }) : cardElement(card, { back: !visibleSlots.has(index) });
      if (hiddenSlots.has(index)) node.classList.add("uth-deal-hidden");
      container.append(framedCardSlot(node, "uth-community-slot"));
    }
  }

  function startingHandClass(cards) {
    if (!cards || cards.length !== 2) return null;
    const [a, b] = cards;
    const high = Math.max(a.rank, b.rank);
    const low = Math.min(a.rank, b.rank);
    if (high === low) return `${RANK_CHARS[high]}${RANK_CHARS[low]}`;
    return `${RANK_CHARS[high]}${RANK_CHARS[low]}${a.suit === b.suit ? "s" : "o"}`;
  }

  function preflopDecision(playerCards) {
    const classLabel = startingHandClass(playerCards);
    const action = D.preflopActions[classLabel];
    if (!action) throw new Error(`No preflop action found for ${classLabel}.`);
    return { action, acceptableActions: [action], classLabel, provisional: D.provisionalPreflopClasses.includes(classLabel) };
  }

  function rankCounts(cards) {
    const counts = Array(15).fill(0);
    cards.forEach(card => { counts[card.rank] += 1; });
    return counts;
  }

  function suitCounts(cards) {
    const counts = Array(4).fill(0);
    cards.forEach(card => { counts[card.suit] += 1; });
    return counts;
  }

  function straightCompletionRanks(cards) {
    const present = new Set(cards.map(card => card.rank));
    const windows = [];
    for (let start = 2; start <= 10; start += 1) windows.push([start, start + 1, start + 2, start + 3, start + 4]);
    windows.push([14, 2, 3, 4, 5]);
    const completions = new Set();
    for (const windowRanks of windows) {
      const missing = windowRanks.filter(rank => !present.has(rank));
      if (missing.length === 1) completions.add(missing[0]);
    }
    return [...completions];
  }

  function hiddenPairInfo(playerCards, board, evaluation) {
    if (evaluation.category !== 1) return { hidden: false, pairRank: evaluation.score[1] || 0, higher: false, lower: false };
    const pairRank = evaluation.score[1];
    const high = Math.max(playerCards[0].rank, playerCards[1].rank);
    const low = Math.min(playerCards[0].rank, playerCards[1].rank);
    const hidden = playerCards.some(card => card.rank === pairRank);
    return { hidden, pairRank, higher: hidden && pairRank === high, lower: hidden && pairRank === low };
  }

  function fourFlushInfo(cards, playerCards) {
    const counts = suitCounts(cards);
    const suit = counts.findIndex(count => count === 4);
    if (suit < 0) return { fourFlush: false, suit: -1, hiddenRank: 0, hiddenCount: 0 };
    const hidden = playerCards.filter(card => card.suit === suit);
    return {
      fourFlush: true,
      suit,
      hiddenRank: hidden.length ? Math.max(...hidden.map(card => card.rank)) : 0,
      hiddenCount: hidden.length
    };
  }

  function boardTexture(board) {
    const counts = rankCounts(board);
    return {
      paired: counts.some(count => count === 2),
      trips: counts.some(count => count === 3),
      maxRank: Math.max(...board.map(card => card.rank))
    };
  }

  function elJefeFlopDecision(playerCards, flop) {
    const cards = [...playerCards, ...flop];
    const evaluation = E.evaluateFive(cards);
    const classLabel = startingHandClass(playerCards);
    const pocket = playerCards[0].rank === playerCards[1].rank;
    const hiddenPair = !pocket && playerCards.some(card => flop.some(boardCard => boardCard.rank === card.rank));
    const flush = fourFlushInfo(cards, playerCards);
    const straightOutCards = straightCompletionRanks(cards).length * 4;
    const board = boardTexture(flop);
    const holeLow = Math.min(playerCards[0].rank, playerCards[1].rank);

    let action = "check";
    let rule = "No El Jefe 2x-raise rule applies.";

    if (evaluation.category >= 4) {
      action = "raise2";
      rule = `Raise with ${evaluation.name.toLowerCase()} or better.`;
    } else if (hiddenPair) {
      action = "raise2";
      rule = "Raise with a hidden pair.";
    } else if (pocket && evaluation.category >= 3) {
      action = "raise2";
      rule = "With pocket deuces, raise when the flop contains a deuce or the flop is three of a kind.";
    } else if (flush.fourFlush && flush.hiddenRank >= 10) {
      action = "raise2";
      rule = "Raise with a four-card flush when a hole card in that suit is a ten or higher.";
      const bareOffsuitTen = /^T[2-9]o$/.test(classLabel) && evaluation.category === 0 && straightOutCards === 0 && flush.hiddenRank === 10;
      if (bareOffsuitTen) {
        action = "check";
        rule = "With an offsuit Tx hand, check when the ten is your only hole card in the flush suit, you have no pair, and you have no inside or outside straight draw.";
      }
    }

    if (action === "check" && ["T9o", "T9s", "J9o"].includes(classLabel) && straightOutCards === 8 && !(board.maxRank < holeLow)) {
      action = "raise2";
      rule = "With T9 or J9, raise this outside or double-inside straight draw unless both hole cards are higher than every flop card.";
    }

    if (action === "check" && ["96s", "97s", "98s"].includes(classLabel) && flush.fourFlush) {
      action = "raise2";
      rule = "With 96s, 97s, or 98s, raise any four-flush.";
    }

    if (action === "check" && ["K2o", "K3o", "K4o"].includes(classLabel) && board.paired && board.maxRank === 14 && evaluation.category === 1) {
      action = "raise2";
      rule = "With K2o–K4o, raise K-high on an ace-containing paired flop.";
    }

    if (action === "check" && ["K2o", "K3o", "K4o"].includes(classLabel) && board.trips) {
      action = "raise2";
      rule = "With K2o–K4o, raise K-high on a three-of-a-kind flop.";
    }

    return { action, rule, evaluation, classLabel, straightOutCards, flush };
  }

  function wizardFlopDecision(playerCards, flop) {
    const cards = [...playerCards, ...flop];
    const evaluation = E.evaluateFive(cards);
    const pocket = playerCards[0].rank === playerCards[1].rank;
    const hiddenPair = playerCards.some(card => flop.some(boardCard => boardCard.rank === card.rank));
    const flush = fourFlushInfo(cards, playerCards);
    if (evaluation.category >= 2) return { action: "raise2", rule: `Raise with ${evaluation.name.toLowerCase()} or better.` };
    if (hiddenPair && !(pocket && playerCards[0].rank === 2)) return { action: "raise2", rule: "Raise with a hidden pair, except pocket deuces." };
    if (flush.fourFlush && flush.hiddenRank >= 10) return { action: "raise2", rule: "Raise with a four-card flush when a hole card in that suit is a ten or higher." };
    return { action: "check", rule: "No Wizard 2x-raise rule applies." };
  }

  function canonicalFlopKey(playerCards, flop) {
    const rows = [];
    for (let suit = 0; suit < 4; suit += 1) {
      let holeMask = 0;
      let flopMask = 0;
      for (const card of playerCards) if (card.suit === suit) holeMask += 2 ** (14 - card.rank);
      for (const card of flop) if (card.suit === suit) flopMask += 2 ** (14 - card.rank);
      rows.push(holeMask * 8192 + flopMask);
    }
    rows.sort((a, b) => a - b);
    return `${rows[0] * 67108864 + rows[1]}:${rows[2] * 67108864 + rows[3]}`;
  }

  function exactFlopDecision(playerCards, flop) {
    const simplified = elJefeFlopDecision(playerCards, flop);
    const exception = exceptionKeys.has(canonicalFlopKey(playerCards, flop));
    const action = exception ? (simplified.action === "raise2" ? "check" : "raise2") : simplified.action;
    return {
      action,
      acceptableActions: [action],
      exception,
      simplified
    };
  }

  function riverStateKey(playerCards, board) {
    const holes = playerCards.map(E.cardId).sort((a, b) => a - b).join(".");
    const boardKey = board.map(E.cardId).sort((a, b) => a - b).join(".");
    return `${holes}|${boardKey}`;
  }

  function exactRiverDecision(playerCards, board) {
    const key = riverStateKey(playerCards, board);
    if (!riverCache.has(key)) riverCache.set(key, E.riverDecision(playerCards, board));
    return riverCache.get(key);
  }

  function oneCardOuts(playerCards, board) {
    const key = riverStateKey(playerCards, board);
    if (!oneCardOutCache.has(key)) oneCardOutCache.set(key, E.oneCardOuts(playerCards, board));
    return oneCardOutCache.get(key);
  }

  function wizardRiverDecision(playerCards, board) {
    const evaluation = E.evaluateSeven([...playerCards, ...board]);
    const hidden = hiddenPairInfo(playerCards, board, evaluation);
    const outs = oneCardOuts(playerCards, board);
    if (evaluation.category >= 2) return { action: "call1", rule: `Call with ${evaluation.name.toLowerCase()} or better.`, outs };
    if (hidden.hidden) return { action: "call1", rule: "Call with a hidden pair.", outs };
    if (outs.beats <= 20) return { action: "call1", rule: `Call because ${outs.beats} dealer outs beat you, which is fewer than 21.`, outs };
    return { action: "fold", rule: `Fold because ${outs.beats} dealer outs beat you and you do not have a hidden pair or better.`, outs };
  }


  function holeContributionInfo(playerCards, board, evaluation = E.evaluateSeven([...playerCards, ...board])) {
    const highIndex = playerCards[0].rank >= playerCards[1].rank ? 0 : 1;
    const lowIndex = highIndex === 0 ? 1 : 0;
    const highRank = playerCards[highIndex].rank;
    const lowRank = playerCards[lowIndex].rank;
    const pocket = highRank === lowRank;
    let contributes;
    let pocketContributes = false;

    if (pocket) {
      // For a pocket pair, removing either physical card leaves an identical card behind.
      // Treat the pair as contributing when removing both cards weakens the best hand.
      const boardOnly = E.evaluateBest(board);
      pocketContributes = E.compareScore(evaluation.score, boardOnly.score) > 0;
      contributes = [pocketContributes, pocketContributes];
    } else {
      const withoutFirst = E.evaluateBest([playerCards[1], ...board]);
      const withoutSecond = E.evaluateBest([playerCards[0], ...board]);
      contributes = [
        E.compareScore(evaluation.score, withoutFirst.score) > 0,
        E.compareScore(evaluation.score, withoutSecond.score) > 0
      ];
    }

    const highContributes = contributes[highIndex];
    const lowContributes = contributes[lowIndex];
    const pairRank = evaluation.category === 1 ? evaluation.score[1] : 0;
    return {
      contributes,
      any: contributes.some(Boolean),
      neither: !contributes.some(Boolean),
      both: contributes.every(Boolean),
      highIndex,
      lowIndex,
      highRank,
      lowRank,
      pocket,
      pocketContributes,
      highContributes,
      lowContributes,
      onlyHigh: highContributes && !lowContributes,
      onlyLow: lowContributes && !highContributes,
      higherMakesPair: !pocket && evaluation.category === 1 && pairRank === highRank && board.some(card => card.rank === highRank),
      lowerMakesPair: !pocket && evaluation.category === 1 && pairRank === lowRank && board.some(card => card.rank === lowRank)
    };
  }

  function maximumSuitCount(cards) {
    return Math.max(...suitCounts(cards));
  }

  function boardHasQuads(board) {
    return rankCounts(board).some(count => count === 4);
  }

  function qualifiesTwentyOneStartingHand(playerCards) {
    const high = Math.max(playerCards[0].rank, playerCards[1].rank);
    const low = Math.min(playerCards[0].rank, playerCards[1].rank);
    if (high === low) return false;
    if (high === 8) return low === 6 || low === 7;
    if (high === 9) return low >= 5 && low <= 8;
    if (high === 10) return low >= 3 && low <= 9;
    if (high === 11) return low >= 3 && low <= 10;
    if (high === 12) return low >= 3 && low <= 11;
    if (high === 13) return low >= 3 && low <= 12 && preflopDecision(playerCards).action === "check";
    return false;
  }

  function elJefeRiverDecision(playerCards, board) {
    const evaluation = E.evaluateSeven([...playerCards, ...board]);
    const outs = oneCardOuts(playerCards, board);
    const count = outs.beats;
    const contribution = holeContributionInfo(playerCards, board, evaluation);
    const boardSuitCount = maximumSuitCount(board);
    const dryBoard = boardSuitCount < 3;
    const pocketDeuces = contribution.pocket && contribution.highRank === 2;
    const pocketDeucesTwoPair = pocketDeuces && evaluation.category === 2 && contribution.any;
    const boardQuadsKicker = boardHasQuads(board) && evaluation.category === 7 && contribution.any;
    const startingHigh = contribution.highRank;

    const decision = (action, rule) => ({
      action,
      rule,
      outs,
      evaluation,
      contribution,
      boardSuitCount,
      dryBoard
    });

    if (count <= 18) return decision("call1", `Call with ${count} one-card outs.`);
    if (boardQuadsKicker && count <= 28) return decision("call1", `Call through 28 outs because the board is four of a kind and a hole card supplies the kicker in your best five-card hand.`);
    if (pocketDeucesTwoPair && count <= 23) return decision("call1", `Call through 23 outs because the pocket deuces are used to make your two-pair hand.`);

    if (count === 19) {
      if (contribution.neither) return decision("fold", "Fold at 19 outs because neither hole card contributes to your final hand.");
      if (pocketDeuces && contribution.any) return decision("call1", "Call at 19 outs because the pocket pair contributes to your best five-card hand.");
      if ([9, 10, 11].includes(startingHigh)) return decision("call1", `Call at 19 outs with a ${E.RANK_LABELS[startingHigh]}-high starting hand when a hole card contributes.`);
      if (startingHigh === 12) {
        const queenTrap = evaluation.category === 0 && contribution.onlyHigh && boardSuitCount === 3;
        return queenTrap
          ? decision("fold", "Fold the 19-out queen-high trap: your final hand is high card, only the queen contributes, and exactly three board cards share a suit.")
          : decision("call1", "Call at 19 outs with a queen-high starting hand when a hole card contributes.");
      }
      if (startingHigh === 13 && evaluation.category === 1 && contribution.onlyHigh) {
        return decision("call1", "Call at 19 outs because the final hand is one pair and only the king contributes.");
      }
      return decision("fold", "Fold at 19 outs because no El Jefe call rule applies.");
    }

    if (count === 20) {
      if (startingHigh >= 8) {
        if (contribution.neither) return decision("fold", "Fold at 20 outs because neither hole card contributes.");
        const lowerPairTrap = [8, 9, 10].includes(startingHigh)
          && evaluation.category === 1
          && contribution.lowerMakesPair
          && contribution.both
          && boardSuitCount < 4;
        if (lowerPairTrap) return decision("fold", "Fold the weak lower-pair trap: the lower hole card makes the pair, the higher card is only a kicker, and the board is not a four-flush.");
        return decision("call1", `Call at 20 outs with a ${E.RANK_LABELS[startingHigh]}-high or stronger starting hand because a hole card contributes.`);
      }

      if (evaluation.category === 2 && contribution.any) {
        return decision("call1", "Call at 20 outs because the final hand is two pair and a hole card contributes.");
      }
      if (contribution.higherMakesPair && (startingHigh === 6 || startingHigh === 7 || dryBoard)) {
        return decision("call1", `Call at 20 outs because the higher hole card makes the pair${startingHigh === 6 || startingHigh === 7 ? " and is a six or seven" : " on a dry board"}.`);
      }
      if (contribution.lowerMakesPair && contribution.onlyLow && dryBoard) {
        return decision("call1", "Call at 20 outs because only the lower hole card makes the pair and the board is dry.");
      }
      return decision("fold", "Fold at 20 outs because no El Jefe call rule applies.");
    }

    if (count === 21) {
      if (evaluation.category === 1 && contribution.higherMakesPair && startingHigh >= 8) {
        return decision("call1", `Call at 21 outs because the higher hole card makes the pair and is ${E.RANK_LABELS[startingHigh]} or better.`);
      }
      if (qualifiesTwentyOneStartingHand(playerCards)) {
        return decision("call1", `Call at 21 outs because ${startingHandClass(playerCards)} belongs to the qualifying starting-hand groups.`);
      }
      return decision("fold", "Fold at 21 outs because no El Jefe call rule applies.");
    }

    return decision("fold", `Fold with ${count} one-card outs because neither global exception applies.`);
  }

  function optimalForStage(stage, playerCards, board) {
    if (stage === "preflop") return preflopDecision(playerCards);
    if (stage === "flop") return exactFlopDecision(playerCards, board.slice(0, 3));
    if (stage === "river") return exactRiverDecision(playerCards, board.slice(0, 5));
    throw new Error(`Unknown stage ${stage}.`);
  }

  function normalizeStrategyDecision(result) {
    return {
      ...result,
      acceptableActions: Array.isArray(result.acceptableActions) ? result.acceptableActions.slice() : [result.action]
    };
  }

  function decisionForStrategy(strategy, stage, playerCards, board) {
    // All three training choices share the same preflop chart.
    if (stage === "preflop") return preflopDecision(playerCards);
    if (strategy === "optimal") return optimalForStage(stage, playerCards, board);
    if (strategy === "jefe") {
      if (stage === "flop") return normalizeStrategyDecision(elJefeFlopDecision(playerCards, board.slice(0, 3)));
      if (stage === "river") return normalizeStrategyDecision(elJefeRiverDecision(playerCards, board.slice(0, 5)));
    }
    if (strategy === "wizard") {
      if (stage === "flop") return normalizeStrategyDecision(wizardFlopDecision(playerCards, board.slice(0, 3)));
      if (stage === "river") return normalizeStrategyDecision(wizardRiverDecision(playerCards, board.slice(0, 5)));
    }
    throw new Error(`Unknown training strategy ${strategy} at ${stage}.`);
  }


  function elJefeFlopRuleTitle(rule) {
    if (rule.includes("pocket deuces")) return "2. Pocket deuces";
    if (rule.includes("hidden pair")) return "3. Hidden pair";
    if (rule.includes("four-card flush") || rule.includes("offsuit Tx")) return "4. Strong four-card flush";
    if (rule.includes("T9 or J9")) return "5. T9 or J9 straight draws";
    if (rule.includes("96s, 97s, or 98s")) return "6. Small suited hands";
    if (rule.includes("ace-containing paired flop")) return "7. Small offsuit kings on an ace-containing paired flop";
    if (rule.includes("three-of-a-kind flop")) return "8. Small offsuit kings on a three-of-a-kind flop";
    if (rule.startsWith("Raise with") && rule.includes("or better")) return "1. Straight or better";
    return "9. Everything else";
  }

  function wizardFlopRuleTitle(rule) {
    if (rule.includes("two pair") || (rule.startsWith("Raise with") && rule.includes("or better"))) return "1. Two pair or better";
    if (rule.includes("hidden pair")) return "2. Hidden pair";
    if (rule.includes("four-card flush")) return "3. Four-card flush";
    return "4. Otherwise check";
  }

  function elJefeRiverRuleTitle(result) {
    const rule = result.rule || "";
    const count = result.outs ? result.outs.beats : null;
    if (rule.includes("through 28 outs")) return "Global Rules · Board quads";
    if (rule.includes("through 23 outs")) return "Global Rules · Pocket deuces making two pair";
    if (count !== null && count <= 18) return "Global Rules · 18 or fewer outs";
    if (count === 19) {
      if (rule.includes("neither hole card")) return "Exactly 19 Outs · Neither hole card contributes";
      if (rule.includes("pocket deuce") || rule.includes("pocket pair contributes")) return "Exactly 19 Outs · Pocket deuces";
      if (rule.includes("9-high") || rule.includes("T-high") || rule.includes("J-high")) return "Exactly 19 Outs · 9-high, T-high, or J-high";
      if (rule.includes("queen-high") || rule.includes("queen")) return "Exactly 19 Outs · Q-high starting hand";
      if (rule.includes("king")) return "Exactly 19 Outs · K-high starting hand";
      return "Exactly 19 Outs · Otherwise fold";
    }
    if (count === 20) {
      if (rule.includes("weak lower-pair trap")) return "Exactly 20 Outs · Weak Lower-Pair Trap";
      if (rule.includes("two pair")) return "Exactly 20 Outs · Two pair with a contributing hole card";
      if (rule.includes("higher hole card makes the pair")) return "Exactly 20 Outs · Higher hole card makes the pair";
      if (rule.includes("lower hole card makes the pair")) return "Exactly 20 Outs · Lower hole card makes the pair";
      if (rule.includes("8-high") || rule.includes("stronger starting hand") || rule.includes("neither hole card")) return "Exactly 20 Outs · Starting hand is 8-high or stronger";
      return "Exactly 20 Outs · Otherwise fold";
    }
    if (count === 21) {
      if (rule.includes("higher hole card makes the pair")) return "Exactly 21 Outs · Higher hidden pair";
      if (rule.includes("qualifying starting-hand groups")) return "Exactly 21 Outs · Qualifying starting hand";
      return "Exactly 21 Outs · Otherwise fold";
    }
    return "More Than 21 Outs · Global exceptions only";
  }

  function wizardRiverRuleTitle(result) {
    const rule = result.rule || "";
    if (rule.includes("hidden pair") || rule.includes("or better")) return "1. Hidden pair or better";
    if (rule.includes("fewer than 21")) return "2. Fewer than 21 one-card outs";
    return "3. Otherwise fold";
  }

  function decisionRuleReference(strategy, stage, expected, playerCards) {
    const label = TRAIN_STRATEGIES[strategy] || TRAIN_STRATEGIES.optimal;
    if (stage === "preflop") {
      const classLabel = expected.classLabel || startingHandClass(playerCards);
      return {
        path: "Look Up → Optimal Preflop Play",
        title: `${classLabel} chart entry`,
        explanation: `The preflop chart calls for ${actionNames(expected.acceptableActions)} with ${classLabel}.`
      };
    }

    if (strategy === "jefe" && stage === "flop") {
      return {
        path: "Look Up → Flop Strategies → El Jefe Strategy",
        title: elJefeFlopRuleTitle(expected.rule || ""),
        explanation: expected.rule
      };
    }
    if (strategy === "wizard" && stage === "flop") {
      return {
        path: "Look Up → Flop Strategies → Wizard of Odds Strategy",
        title: wizardFlopRuleTitle(expected.rule || ""),
        explanation: expected.rule
      };
    }
    if (strategy === "jefe" && stage === "river") {
      return {
        path: "Look Up → River Strategies → El Jefe Strategy",
        title: elJefeRiverRuleTitle(expected),
        explanation: expected.rule
      };
    }
    if (strategy === "wizard" && stage === "river") {
      return {
        path: "Look Up → River Strategies → Wizard of Odds Strategy",
        title: wizardRiverRuleTitle(expected),
        explanation: expected.rule
      };
    }

    if (stage === "flop") {
      if (expected.exception) {
        return {
          path: "Look Up → Post-flop decision",
          title: "Best-play exception",
          explanation: `This exact flop is an exception to the simplified El Jefe rule. The best play is ${actionNames(expected.acceptableActions)}.`
        };
      }
      const simplified = expected.simplified;
      return {
        path: "Look Up → Post-flop decision",
        title: simplified ? `Best play · ${elJefeFlopRuleTitle(simplified.rule || "")}` : "Best flop play",
        explanation: simplified && simplified.rule ? simplified.rule : `The best play is ${actionNames(expected.acceptableActions)}.`
      };
    }

    const callEV = Number.isFinite(expected.callEV) ? formatUnits(expected.callEV) : "the calculated call value";
    const foldEV = Number.isFinite(expected.foldEV) ? formatUnits(expected.foldEV) : "−2 units";
    return {
      path: "Look Up → River decision",
      title: "Best river play",
      explanation: `Calling is worth ${callEV}; folding is worth ${foldEV}. The best play is ${actionNames(expected.acceptableActions)}.`
    };
  }

  function availableActions(stage, disabled = false) {
    if (disabled) return [];
    if (stage === "preflop") return [
      { action: "check", key: "C", label: "Check" },
      { action: "raise4", key: "4", label: "Raise 4x" }
    ];
    if (stage === "flop") return [
      { action: "check", key: "C", label: "Check" },
      { action: "raise2", key: "2", label: "Raise 2x" }
    ];
    if (stage === "river") return [
      { action: "fold", key: "F", label: "Fold" },
      { action: "call1", key: "1", label: "Call 1x" }
    ];
    return [];
  }

  function gradeDecision(round, action, strategy = "optimal") {
    if (!round.scoringActive) return null;
    const rawExpected = decisionForStrategy(strategy, round.stage, round.playerCards, round.board);
    const expected = {
      ...rawExpected,
      reference: decisionRuleReference(strategy, round.stage, rawExpected, round.playerCards)
    };
    if (!expected.acceptableActions.includes(action)) {
      round.perfect = false;
      round.scoringActive = false;
      round.firstMistake = {
        stage: round.stage,
        chosen: action,
        optimal: expected.action,
        acceptable: expected.acceptableActions.slice(),
        strategy,
        rule: expected.rule || "",
        reference: { ...expected.reference }
      };
    }
    return expected;
  }

  function mistakeText(mistake) {
    if (!mistake) return "";
    const optimal = mistake.acceptable.length > 1
      ? mistake.acceptable.map(action => ACTION_LABELS[action]).join(" or ")
      : ACTION_LABELS[mistake.optimal];
    return `First mistake: ${STREET_LABELS[mistake.stage]}. You chose ${ACTION_LABELS[mistake.chosen]}; optimal play was ${optimal}.`;
  }

  function copyCard(card) {
    return { rank: card.rank, suit: card.suit };
  }

  function mistakeSnapshot(round, number) {
    const mistake = round.firstMistake;
    const visibleBoard = mistake.stage === "preflop" ? 0 : mistake.stage === "flop" ? 3 : 5;
    return {
      number,
      stage: mistake.stage,
      chosen: mistake.chosen,
      optimal: mistake.optimal,
      acceptable: mistake.acceptable.slice(),
      playerCards: round.playerCards.map(copyCard),
      board: round.board.slice(0, visibleBoard).map(copyCard),
      strategy: mistake.strategy || round.trainingStrategy || "optimal",
      rule: mistake.rule || "",
      reference: mistake.reference ? { ...mistake.reference } : null
    };
  }

  function miniCardMarkup(card) {
    const suitClass = SUIT_CLASSES[card.suit];
    return `<span class="mistake-mini-card ${suitClass}"><b>${E.RANK_LABELS[card.rank]}</b><i>${E.SUITS[card.suit]}</i></span>`;
  }

  function actionNames(actions) {
    return actions.map(action => ACTION_LABELS[action]).join(" or ");
  }

  function ruleFailureMarkup(reference, heading = "Why this missed the strategy") {
    if (!reference) return "";
    return `<div class="strategy-rule-failure"><small>${heading}</small><span class="strategy-rule-path">${reference.path}</span><strong>${reference.title}</strong><p>${reference.explanation}</p></div>`;
  }

  function renderMistakeList(mistakes, summaryNode, listNode, expectedLabel = "Optimal play") {
    summaryNode.textContent = `Review mistakes (${mistakes.length})`;
    if (!mistakes.length) {
      listNode.innerHTML = `<p class="mistake-empty">No mistakes in this session.</p>`;
      return;
    }
    listNode.innerHTML = mistakes.slice().reverse().map(mistake => {
      const board = mistake.board.length
        ? `<div class="mistake-card-group"><small>Board</small><div class="mistake-mini-hand">${mistake.board.map(miniCardMarkup).join("")}</div></div>`
        : "";
      return `<article class="mistake-card"><h3>Hand ${mistake.number} · ${STREET_LABELS[mistake.stage]}</h3><div class="mistake-visual"><div class="mistake-card-group"><small>Player</small><div class="mistake-mini-hand">${mistake.playerCards.map(miniCardMarkup).join("")}</div></div>${board}</div><div class="mistake-decision-grid"><div><small>Your play</small><strong class="mistake-chosen">${ACTION_LABELS[mistake.chosen]}</strong></div><div><small>${expectedLabel}</small><strong class="mistake-optimal">${actionNames(mistake.acceptable)}</strong></div></div>${ruleFailureMarkup(mistake.reference)}</article>`;
    }).join("");
  }

  function setDecisionIndicator(node, round) {
    const completed = Boolean(round && round.completed);
    node.classList.toggle("visible", completed);
    node.classList.toggle("correct", completed && round.perfect);
    node.classList.toggle("incorrect", completed && !round.perfect);
    node.textContent = completed ? (round.perfect ? "+" : "−") : "";
  }

  function trainDecisionRecap(round) {
    const strategy = TRAIN_STRATEGIES[round.trainingStrategy] || TRAIN_STRATEGIES.optimal;
    const rows = round.decisions.map(decision => {
      const correct = decision.acceptable.includes(decision.chosen);
      const chosen = correct ? "" : `<small>Your play: ${ACTION_LABELS[decision.chosen]}</small>`;
      const ruleFailure = correct ? "" : ruleFailureMarkup(decision.reference);
      return `<div class="decision-recap-row ${correct ? "correct" : "incorrect"}"><span class="decision-recap-mark">${correct ? "+" : "−"}</span><div><strong>${STREET_LABELS[decision.stage]}</strong><span>${strategy.recapLabel}: ${actionNames(decision.acceptable)}</span>${chosen}${ruleFailure}</div></div>`;
    }).join("");
    return `<div class="decision-recap"><div class="decision-recap-title">Correct play by street · ${strategy.label}</div>${rows}</div>`;
  }

  function newPlayRound() {
    const deck = E.shuffledDeck();
    return {
      playerCards: deck.slice(0, 2),
      dealerCards: deck.slice(2, 4),
      board: deck.slice(4, 9),
      stage: "preflop",
      playMultiplier: 0,
      balanceBefore: state.play.balance,
      boardVisible: 0,
      dealerVisible: 0,
      boardHiddenSlots: [],
      dealerHiddenSlots: [],
      animating: false,
      revealText: "",
      completed: false,
      folded: false,
      result: null,
      perfect: true,
      scoringActive: true,
      firstMistake: null
    };
  }

  function startPlayHand() {
    if (state.play.round && !state.play.round.completed) return;
    state.play.balance -= 2;
    state.play.round = newPlayRound();
    state.play.round.balanceBefore = state.play.balance + 2;
    renderPlay();
  }

  function sleep(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function nextFrame() {
    return new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  }

  function pinDealCard(node, slot) {
    const target = slot.classList.contains("uth-card-slot") ? slot.querySelector(".card") : slot;
    const left = slot.offsetLeft + (target && target !== slot ? target.offsetLeft : 0);
    const top = slot.offsetTop + (target && target !== slot ? target.offsetTop : 0);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.width = `${target ? target.offsetWidth : slot.offsetWidth}px`;
    node.style.height = `${target ? target.offsetHeight : slot.offsetHeight}px`;
  }

  async function animateDealPacket(round, { container, cards, targetSlots, hiddenField, message }) {
    round.animating = true;
    round.revealText = message;
    round[hiddenField] = [...targetSlots];
    renderPlayControls(round);
    const slots = [...container.children];
    const stackSlot = slots[targetSlots[targetSlots.length - 1]];
    if (!stackSlot) return false;
    targetSlots.forEach(index => {
      const card = slots[index] && slots[index].querySelector(".card");
      if (card) card.classList.add("uth-deal-hidden");
    });
    await nextFrame();
    if (state.play.round !== round) return false;
    const packet = cards.map((card, index) => {
      const node = cardElement(card);
      node.classList.add("uth-deal-card");
      node.style.zIndex = String(30 - index);
      pinDealCard(node, stackSlot);
      container.append(node);
      return node;
    });
    await sleep(WINDOW_PAUSE);
    if (state.play.round !== round) return false;
    packet.forEach((node, index) => {
      node.style.transition = `left ${DEAL_SLIDE_DURATION}ms cubic-bezier(.2,.82,.25,1), top ${DEAL_SLIDE_DURATION}ms cubic-bezier(.2,.82,.25,1)`;
      pinDealCard(node, slots[targetSlots[index]]);
    });
    await sleep(DEAL_SLIDE_DURATION + DEAL_SETTLE_DELAY);
    if (state.play.round !== round) return false;
    targetSlots.forEach((slotIndex, cardIndex) => slots[slotIndex].replaceChildren(cardElement(cards[cardIndex])));
    packet.forEach(node => node.remove());
    round[hiddenField] = [];
    return true;
  }

  async function revealFlop(round) {
    const preservedStage = round.stage;
    const okay = await animateDealPacket(round, {
      container: el.playCommunity,
      cards: round.board.slice(0, 3),
      targetSlots: [2, 3, 4],
      hiddenField: "boardHiddenSlots",
      message: "Dealing the flop..."
    });
    if (!okay) return false;
    round.boardVisible = 3;
    round.stage = preservedStage === "showdown" ? "showdown" : "flop";
    if (preservedStage !== "showdown") {
      round.animating = false;
      round.revealText = "";
      renderPlayControls(round);
    }
    return true;
  }

  async function revealTurnAndRiver(round) {
    const preservedStage = round.stage;
    const okay = await animateDealPacket(round, {
      container: el.playCommunity,
      cards: round.board.slice(3, 5),
      targetSlots: [0, 1],
      hiddenField: "boardHiddenSlots",
      message: "Dealing the turn and river..."
    });
    if (!okay) return false;
    round.boardVisible = 5;
    round.stage = preservedStage === "showdown" ? "showdown" : "river";
    if (preservedStage !== "showdown") {
      round.animating = false;
      round.revealText = "";
      renderPlayControls(round);
    }
    return true;
  }

  async function revealDealer(round, message = "Revealing the dealer cards...") {
    const okay = await animateDealPacket(round, {
      container: el.playDealer,
      cards: round.dealerCards,
      targetSlots: [0, 1],
      hiddenField: "dealerHiddenSlots",
      message
    });
    if (!okay) return false;
    round.dealerVisible = 2;
    return true;
  }

  async function resolveShowdown(round, multiplier) {
    round.playMultiplier = multiplier;
    state.play.balance -= multiplier;
    round.stage = "showdown";
    renderWagers(round);
    renderPlayStats();
    if (round.boardVisible < 3 && !await revealFlop(round)) return;
    if (round.boardVisible < 5 && !await revealTurnAndRiver(round)) return;
    if (!await revealDealer(round)) return;
    round.result = E.settleHand({ playerCards: round.playerCards, dealerCards: round.dealerCards, board: round.board, playMultiplier: multiplier });
    state.play.balance += round.result.returned;
    round.completed = true;
    round.animating = false;
    round.revealText = "";
    round.stage = "complete";
    completePlayHand();
  }

  async function resolveFold(round) {
    round.folded = true;
    round.stage = "showdown";
    if (!await revealDealer(round, "Folded — revealing the dealer cards...")) return;
    round.result = { net: state.play.balance - round.balanceBefore, winner: "fold", dealer: E.evaluateSeven([...round.dealerCards, ...round.board]) };
    round.completed = true;
    round.animating = false;
    round.revealText = "";
    round.stage = "complete";
    completePlayHand();
  }

  async function takePlayAction(action) {
    const round = state.play.round;
    if (!round || round.completed || round.animating) return;
    const permitted = availableActions(round.stage).some(item => item.action === action);
    if (!permitted) return;
    gradeDecision(round, action);
    if (action === "check") {
      if (round.stage === "preflop") await revealFlop(round);
      else if (round.stage === "flop") await revealTurnAndRiver(round);
      return;
    }
    if (action === "fold") {
      await resolveFold(round);
      return;
    }
    const multipliers = { raise4: 4, raise2: 2, call1: 1 };
    await resolveShowdown(round, multipliers[action]);
  }

  function completePlayHand() {
    const p = state.play;
    const round = p.round;
    const net = Number(round && round.result && round.result.net);
    p.hands += 1;
    if (round.perfect) p.perfectHands += 1;
    else if (round.firstMistake) {
      p.mistakes.push(mistakeSnapshot(round, p.hands));
      if (p.mistakes.length > 25) p.mistakes.shift();
    }
    if (Number.isFinite(net) && net > 1e-9) p.wins += 1;
    else if (Number.isFinite(net) && net < -1e-9) p.losses += 1;
    else p.pushes += 1;
    p.history.push(p.balance);
    if (p.history.length > 301) p.history.shift();
    savePlay();
    renderPlayChrome(round);
  }

  function renderChipStack(container, count) {
    container.replaceChildren();
    for (let index = 0; index < count; index += 1) {
      const chip = document.createElement("span");
      chip.className = "uth-chip";
      chip.style.setProperty("--chip-index", String(index));
      chip.style.setProperty("--chip-center", String((count - 1) / 2));
      chip.setAttribute("aria-hidden", "true");
      container.append(chip);
    }
    container.parentElement.classList.toggle("has-chips", count > 0);
  }

  function renderWagers(round) {
    renderChipStack(el.anteChips, round ? 1 : 0);
    renderChipStack(el.blindChips, round ? 1 : 0);
    renderChipStack(el.playChips, round ? round.playMultiplier : 0);
  }

  function playMessageForRound(round) {
    if (!round) return { text: "Press Deal to begin.", tone: "neutral" };
    if (round.animating) return { text: round.revealText || "Revealing cards...", tone: "neutral" };
    if (!round.completed) {
      if (round.stage === "preflop") return { text: "Choose Check or Raise 4x.", tone: "neutral" };
      if (round.stage === "flop") return { text: "The flop is out. Choose Check or Raise 2x.", tone: "neutral" };
      if (round.stage === "river") return { text: "The board is complete. Call 1x or Fold.", tone: "neutral" };
    }
    if (round.folded) return { text: `Folded. Dealer had ${round.result.dealer.name}. Ante and Blind lose. Net ${formatUnits(round.result.net, true)}.`, tone: "loss" };
    const result = round.result;
    const qualification = result.dealerQualifies ? "Dealer qualifies." : "Dealer does not qualify; Ante pushes.";
    const blindText = result.winner === "player" ? (result.blindOdds > 0 ? ` Blind pays ${formatNumber(result.blindOdds)} to 1.` : " Blind pushes.") : "";
    if (result.winner === "tie") return { text: `Push — both finish with ${result.player.name}. Net 0 units.`, tone: "neutral" };
    if (result.winner === "player") return { text: `You win with ${result.player.name}; dealer has ${result.dealer.name}. ${qualification}${blindText} Net ${formatUnits(result.net, true)}.`, tone: "win" };
    return { text: `Dealer wins with ${result.dealer.name}; you have ${result.player.name}. ${qualification} Net ${formatUnits(result.net, true)}.`, tone: "loss" };
  }

  function actionButton(item, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `uth-action-button action-${item.action}`;
    button.dataset.action = item.action;
    button.setAttribute("aria-label", `${item.label}; keyboard shortcut ${item.key}`);
    button.innerHTML = `<span class="uth-action-key">${item.key}</span><span class="uth-action-label">${item.label}</span>`;
    button.addEventListener("click", () => handler(item.action));
    return button;
  }

  function renderPlayActions(round) {
    el.playActions.replaceChildren();
    if (!round || round.completed || round.animating) return;
    availableActions(round.stage).forEach(item => el.playActions.append(actionButton(item, takePlayAction)));
  }

  function renderPlayControls(round) {
    renderPlayActions(round);
    const message = playMessageForRound(round);
    el.playMessage.textContent = message.text;
    el.playMessage.classList.remove("win", "loss");
    if (message.tone !== "neutral") el.playMessage.classList.add(message.tone);
    el.playDeal.disabled = Boolean(round && !round.completed);
    el.playDeal.textContent = round && round.completed ? "Deal Again" : "Deal";
  }

  function renderPlayStats() {
    const p = state.play;
    el.playBalance.textContent = formatUnits(p.balance);
    el.playBalance.classList.toggle("positive", p.balance > 0);
    el.playBalance.classList.toggle("negative", p.balance < 0);
    el.playAccuracy.textContent = formatPercent(p.perfectHands, p.hands);
    el.completedHands.textContent = String(p.hands);
    el.playWins.textContent = String(p.wins);
    el.playPushes.textContent = String(p.pushes);
    el.playLosses.textContent = String(p.losses);
    const completedRound = p.round && p.round.completed ? p.round : null;
    setDecisionIndicator(el.playDecisionIndicator, completedRound);
    el.playDeltaSummary.textContent = p.hands ? `${p.perfectHands} of ${p.hands} hands played perfectly.` : "Accuracy is scored by perfectly played hands.";
    renderMistakeList(p.mistakes, el.playMistakeSummary, el.playMistakeList);
    scheduleBalanceChartDraw();
  }

  function renderPlayChrome(round) {
    renderWagers(round);
    renderPlayControls(round);
    renderPlayStats();
  }

  function renderPlay() {
    const round = state.play.round;
    renderDealerRow(round);
    renderCommunityRow(el.playCommunity, round);
    renderCardRow(el.playPlayer, round && round.playerCards, round ? 2 : 0, 2);
    renderPlayChrome(round);
  }

  function newTrainRound(strategy = state.train.strategy) {
    const deck = E.shuffledDeck();
    return {
      playerCards: deck.slice(0, 2),
      board: deck.slice(2, 7),
      stage: "preflop",
      boardVisible: 0,
      completed: false,
      perfect: true,
      scoringActive: true,
      firstMistake: null,
      lastOptimal: null,
      decisions: [],
      trainingStrategy: strategy
    };
  }

  function startTrainHand() {
    if (state.train.round && !state.train.round.completed) return;
    state.train.round = newTrainRound();
    renderTrain();
  }

  function completeTrainHand(round) {
    if (round.counted) return;
    round.counted = true;
    const session = trainSession(round.trainingStrategy);
    session.hands += 1;
    if (round.perfect) session.perfectHands += 1;
    else if (round.firstMistake) {
      session.errors[round.firstMistake.stage] += 1;
      session.mistakes.push(mistakeSnapshot(round, session.hands));
      if (session.mistakes.length > 25) session.mistakes.shift();
    }
    saveTrain();
  }

  function takeTrainAction(action) {
    const round = state.train.round;
    if (!round || round.completed) return;
    if (!availableActions(round.stage).some(item => item.action === action)) return;
    const expected = gradeDecision(round, action, round.trainingStrategy);
    round.lastOptimal = expected;
    round.decisions.push({ stage: round.stage, chosen: action, optimal: expected.action, acceptable: expected.acceptableActions.slice(), rule: expected.rule || "", reference: expected.reference ? { ...expected.reference } : null });
    if (round.firstMistake) {
      round.completed = true;
      completeTrainHand(round);
      renderTrain();
      return;
    }
    if (round.stage === "preflop") {
      if (action === "check") {
        round.stage = "flop";
        round.boardVisible = 3;
      } else {
        round.completed = true;
        completeTrainHand(round);
      }
    } else if (round.stage === "flop") {
      if (action === "check") {
        round.stage = "river";
        round.boardVisible = 5;
      } else {
        round.completed = true;
        completeTrainHand(round);
      }
    } else if (round.stage === "river") {
      round.completed = true;
      completeTrainHand(round);
    }
    renderTrain();
  }

  function renderTrainActions(round) {
    el.trainActions.replaceChildren();
    if (!round || round.completed) return;
    availableActions(round.stage).forEach(item => el.trainActions.append(actionButton(item, takeTrainAction)));
  }

  function renderTrain() {
    const t = trainSession();
    const round = state.train.round;
    const strategy = TRAIN_STRATEGIES[state.train.strategy];
    renderCommunityRow(el.trainCommunity, round, true);
    renderCardRow(el.trainPlayer, round && round.playerCards, round ? 2 : 0, 2);
    renderTrainActions(round);
    el.trainStrategy.value = state.train.strategy;
    el.trainStrategy.disabled = Boolean(round && !round.completed);
    el.trainHands.textContent = String(t.hands);
    el.trainAccuracy.textContent = formatPercent(t.perfectHands, t.hands);
    setDecisionIndicator(el.trainDecisionIndicator, round && round.completed ? round : null);
    renderMistakeList(t.mistakes, el.trainMistakeSummary, el.trainMistakeList, `${strategy.recapLabel} play`);
    el.trainDeal.disabled = Boolean(round && !round.completed);
    el.trainDeal.textContent = round && round.completed ? "Deal Next" : "Deal";
    el.trainFeedback.classList.remove("correct");
    if (!round) {
      el.trainMessage.textContent = "Press Deal to begin.";
      el.trainFeedback.classList.add("hidden");
    } else if (round.completed) {
      el.trainMessage.textContent = round.perfect ? `Hand played correctly against ${strategy.label}.` : `First mistake against ${strategy.label} is explained below.`;
      el.trainFeedback.innerHTML = trainDecisionRecap(round);
      el.trainFeedback.classList.remove("hidden");
      el.trainFeedback.classList.toggle("correct", round.perfect);
    } else {
      const prompts = {
        preflop: "Choose Check or Raise 4x.",
        flop: "Choose Check or Raise 2x.",
        river: "Choose Call 1x or Fold."
      };
      el.trainMessage.textContent = prompts[round.stage];
      el.trainFeedback.classList.add("hidden");
    }
  }

  function lookupCardSignature() {
    return state.lookup.cards.map(card => card ? E.cardId(card) : "-").join(",");
  }

  function lookupBoardCount() {
    return state.lookup.cards.slice(2).filter(Boolean).length;
  }

  function lookupCardsSequential() {
    let emptySeen = false;
    for (const card of state.lookup.cards.slice(2)) {
      if (!card) emptySeen = true;
      else if (emptySeen) return false;
    }
    return true;
  }

  function lookupStage() {
    if (!state.lookup.cards[0] || !state.lookup.cards[1] || !lookupCardsSequential()) return null;
    const count = lookupBoardCount();
    if (count === 0) return "preflop";
    if (count === 3) return "flop";
    if (count === 5) return "river";
    return null;
  }

  function lookupProgress() {
    const playerCount = state.lookup.cards.slice(0, 2).filter(Boolean).length;
    const boardCount = lookupBoardCount();
    if (playerCount < 2) {
      return { label: "Preflop", button: playerCount === 0 ? "Add Player Cards" : "Add One More Player Card", ready: false };
    }
    if (!lookupCardsSequential()) return { label: "Community Cards", button: "Fill Community Cards Left to Right", ready: false };
    if (boardCount === 0) return { label: "Preflop", button: "Find Best Preflop Play", ready: true };
    if (boardCount < 3) {
      const needed = 3 - boardCount;
      return { label: "Building Post-Flop", button: `Add ${needed} More Community ${needed === 1 ? "Card" : "Cards"}`, ready: false };
    }
    if (boardCount === 3) return { label: "Post-Flop", button: "Find Best Post-Flop Play", ready: true };
    if (boardCount === 4) return { label: "Building River", button: "Add One More Community Card", ready: false };
    return { label: "River", button: "Find Best River Play", ready: true };
  }

  function nextLookupEmpty() {
    return state.lookup.cards.findIndex(card => !card);
  }

  function lookupSlotButton(index, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lookup-slot${state.lookup.activeSlot === index ? " active" : ""}`;
    const card = state.lookup.cards[index];
    button.append(card ? cardElement(card) : cardElement(null, { placeholder: true }));
    button.setAttribute("aria-label", card ? `${label}: ${E.labelCard(card)}` : `${label}: empty`);
    button.addEventListener("click", () => {
      state.lookup.activeSlot = index;
      state.lookup.pendingRank = null;
      renderLookup();
    });
    return button;
  }

  function renderLookupSlots() {
    el.lookupPlayerSlots.replaceChildren();
    el.lookupBoardSlots.replaceChildren();
    el.lookupPlayerSlots.append(lookupSlotButton(0, "Player card 1"), lookupSlotButton(1, "Player card 2"));
    for (let index = 0; index < 5; index += 1) el.lookupBoardSlots.append(lookupSlotButton(index + 2, `Community card ${index + 1}`));
    el.lookupBoardGroup.classList.remove("hidden");
    const count = lookupBoardCount();
    el.lookupBoardHelp.textContent = count < 3
      ? "Add three cards for a post-flop decision or all five for a river decision"
      : count < 5
        ? "Add two more community cards to look up the river"
        : "Five community cards entered";
  }

  function buildLookupPickers() {
    el.lookupRankPicker.replaceChildren();
    [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].forEach(rank => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rank-button";
      button.textContent = E.RANK_LABELS[rank];
      button.classList.toggle("active", state.lookup.pendingRank === rank);
      button.addEventListener("click", () => {
        state.lookup.pendingRank = rank;
        renderLookup();
      });
      el.lookupRankPicker.append(button);
    });
    el.lookupSuitPicker.replaceChildren();
    E.SUITS.forEach((suit, suitIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `suit-button ${SUIT_CLASSES[suitIndex]}`;
      button.textContent = suit;
      button.disabled = state.lookup.pendingRank === null;
      button.addEventListener("click", () => chooseLookupCard(state.lookup.pendingRank, suitIndex));
      el.lookupSuitPicker.append(button);
    });
  }

  function chooseLookupCard(rank, suit) {
    if (rank === null || state.lookup.activeSlot === null) return;
    const card = { rank, suit };
    const duplicate = state.lookup.cards.some((other, index) => index !== state.lookup.activeSlot && other && E.cardId(other) === E.cardId(card));
    if (duplicate) {
      el.lookupMessage.textContent = "That card is already in the visible hand.";
      el.lookupMessage.classList.add("error");
      return;
    }
    state.lookup.cards[state.lookup.activeSlot] = card;
    state.lookup.pendingRank = null;
    const next = nextLookupEmpty();
    state.lookup.activeSlot = next >= 0 ? next : state.lookup.activeSlot;
    renderLookup();
  }

  function clearLookup() {
    state.lookup.cards = Array(7).fill(null);
    state.lookup.activeSlot = 0;
    state.lookup.pendingRank = null;
    state.lookup.resultSignature = null;
    renderLookup();
  }

  function removeLookupCard() {
    if (state.lookup.activeSlot === null) return;
    state.lookup.cards[state.lookup.activeSlot] = null;
    state.lookup.pendingRank = null;
    state.lookup.resultSignature = null;
    renderLookup();
  }

  function actionBadge(action) {
    return `<span class="lookup-action-badge action-${action}">${ACTION_LABELS[action]}</span>`;
  }


  function renderBestLookup() {
    const street = lookupStage();
    if (!street) return;
    const playerCards = state.lookup.cards.slice(0, 2);
    const board = state.lookup.cards.slice(2).filter(Boolean);
    let html = "";
    let reachable = true;

    if (street === "preflop") {
      const result = preflopDecision(playerCards);
      html = `<div class="lookup-verdict"><strong>Best Play</strong>${actionBadge(result.action)}<span>${result.classLabel}</span></div>`;
    } else if (street === "flop") {
      const pre = preflopDecision(playerCards);
      if (pre.action === "raise4") {
        reachable = false;
        html = `<div class="lookup-verdict warning"><strong>Unreachable Under Optimal Play</strong><span>${pre.classLabel} should raise 4x preflop, so this post-flop decision is never reached.</span></div>`;
      } else {
        const result = exactFlopDecision(playerCards, board);
        html = `<div class="lookup-verdict"><strong>Best Play</strong>${actionBadge(result.action)}</div>`;
      }
    } else {
      const result = exactRiverDecision(playerCards, board);
      const pre = preflopDecision(playerCards);
      let pathText = "This river is reachable through the recommended prior checks.";
      if (pre.action === "raise4") {
        reachable = false;
        pathText = `Off the optimal path: ${pre.classLabel} should raise 4x preflop.`;
      } else {
        const flop = exactFlopDecision(playerCards, board.slice(0, 3));
        if (flop.action === "raise2") {
          reachable = false;
          pathText = "Off the optimal path: the best post-flop play is Raise 2x.";
        }
      }
      const tieText = result.indifferent ? "Call and Fold have identical value." : `Calling is ${result.margin >= 0 ? "better" : "worse"} by ${Math.abs(result.margin).toFixed(4)} units.`;
      html = `<div class="lookup-verdict${reachable ? "" : " warning"}"><strong>Best Play</strong>${actionBadge(result.action)}<span>${pathText}</span></div><div class="lookup-ev-grid"><div><small>Call EV</small><strong>${result.callEV.toFixed(4)}</strong></div><div><small>Fold EV</small><strong>-2.0000</strong></div><div><small>Dealer hands</small><strong>${result.combinations}</strong></div></div><p class="lookup-explanation">${tieText} Dealer outcomes: ${result.wins} player wins, ${result.ties} ties, and ${result.losses} losses.</p>`;
    }

    state.lookup.resultSignature = lookupCardSignature();
    el.lookupResult.innerHTML = html;
    el.lookupResult.classList.remove("hidden");
    el.lookupMessage.classList.remove("error");
    el.lookupMessage.textContent = reachable ? "Best play found." : street === "river" ? "River play found; the position is off the optimal path." : "An earlier best play prevents this decision.";
    if (street !== "preflop" && (street === "river" || reachable)) renderSimplifiedLookup(street);
    else el.lookupStrategyResults.classList.add("hidden");
  }

  function renderSimplifiedLookup(street = lookupStage()) {
    if (!street || street === "preflop") {
      el.lookupStrategyResults.classList.add("hidden");
      return;
    }
    const playerCards = state.lookup.cards.slice(0, 2);
    const board = state.lookup.cards.slice(2).filter(Boolean);
    const optimal = street === "flop" ? exactFlopDecision(playerCards, board).action : exactRiverDecision(playerCards, board).action;
    const cards = [];

    if (street === "flop") {
      const jefe = elJefeFlopDecision(playerCards, board);
      const wizard = wizardFlopDecision(playerCards, board);
      cards.push(strategyLookupCard("El Jefe Strategy — Intermediate", jefe, optimal, `Cuts the Wizard strategy’s post-flop decision cost by ${D.flopPenaltyReductionPercent.toFixed(2)}% in our analysis.`));
      cards.push(strategyLookupCard("Wizard of Odds Strategy — Beginner", wizard, optimal, "The simpler published basic strategy."));
    } else {
      const jefe = elJefeRiverDecision(playerCards, board);
      const wizard = wizardRiverDecision(playerCards, board);
      cards.push(strategyLookupCard("Wizard of Odds Strategy — Beginner", wizard, optimal, `One-card dealer outs that beat you: ${wizard.outs.beats} of ${wizard.outs.total}.`));
      cards.push(strategyLookupCard("El Jefe Strategy — Intermediate", jefe, optimal, `One-card dealer outs that beat you: ${jefe.outs.beats}.`));
    }
    el.lookupStrategyResults.innerHTML = cards.join("");
    el.lookupStrategyResults.classList.remove("hidden");
  }

  function strategyLookupCard(title, result, optimal, note) {
    const agrees = result.action === optimal;
    return `<article class="lookup-strategy-card"><div class="strategy-result-heading"><strong>${title}</strong>${actionBadge(result.action)}</div><p>${result.rule}</p><p class="strategy-agreement ${agrees ? "agrees" : "differs"}">${agrees ? "Matches the best play." : "Differs from the best play in this situation."}</p><small>${note}</small></article>`;
  }

  function renderLookup() {
    renderLookupSlots();
    buildLookupPickers();
    if (state.lookup.activeSlot === null || state.lookup.activeSlot < 0 || state.lookup.activeSlot > 6) state.lookup.activeSlot = 0;
    const slotLabel = state.lookup.activeSlot < 2 ? `player card ${state.lookup.activeSlot + 1}` : `community card ${state.lookup.activeSlot - 1}`;
    el.lookupPickerLabel.textContent = state.lookup.pendingRank === null ? `Choose a rank for ${slotLabel}` : `Choose a suit for ${E.RANK_LABELS[state.lookup.pendingRank]}`;
    el.lookupRemove.disabled = !state.lookup.cards[state.lookup.activeSlot];
    const progress = lookupProgress();
    el.lookupSearch.textContent = progress.button;
    el.lookupSearch.disabled = !progress.ready;
    const signature = lookupCardSignature();
    if (state.lookup.resultSignature !== signature) {
      el.lookupResult.classList.add("hidden");
      el.lookupStrategyResults.classList.add("hidden");
      if (!el.lookupMessage.classList.contains("error")) el.lookupMessage.textContent = progress.ready ? "Cards are ready." : "";
    }
  }

  function buildPreflopChart() {
    const table = document.createElement("table");
    table.className = "preflop-strategy-table triangular-chart";
    const rowRanks = [...CHART_RANKS];
    const columnRanks = [...CHART_RANKS].reverse();
    const rankValue = rank => ({ A:14, K:13, Q:12, J:11, T:10, 9:9, 8:8, 7:7, 6:6, 5:5, 4:4, 3:3, 2:2 })[rank];
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = `<th class="corner-cell" aria-hidden="true"></th>${columnRanks.map(rank => `<th>${rank}</th>`).join("")}`;
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    for (const rowRank of rowRanks) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      rowHeader.textContent = rowRank;
      row.append(rowHeader);
      for (const colRank of columnRanks) {
        const cell = document.createElement("td");
        if (rankValue(colRank) > rankValue(rowRank)) {
          cell.className = "preflop-chart-empty";
          row.append(cell);
          continue;
        }
        const key = `${rowRank}${colRank}`;
        const category = D.preflopChart[key];
        const code = category === "always" ? "4X" : category === "suited" ? "4XS" : "C";
        const marker = document.createElement("span");
        marker.className = `preflop-chart-cell cell-${category}`;
        marker.textContent = code;
        const detail = category === "always" ? "Raise 4x suited or offsuit" : category === "suited" ? "Raise 4x only when suited; check offsuit" : "Check suited or offsuit";
        marker.title = `${key}: ${detail}`;
        cell.append(marker);
        row.append(cell);
      }
      tbody.append(row);
    }
    table.append(thead, tbody);
    el.preflopChartContainer.replaceChildren(table);
  }

  function scheduleBalanceChartDraw() {
    if (balanceChartFrame) return;
    balanceChartFrame = window.requestAnimationFrame(() => {
      balanceChartFrame = 0;
      drawBalanceChart();
    });
  }

  function drawBalanceChart() {
    const canvas = el.playChart;
    if (!canvas || canvas.offsetParent === null) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(280, rect.width);
    const height = Math.max(150, rect.height);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    const values = state.play.history.length ? state.play.history : [0];
    const signature = `${pixelWidth}x${pixelHeight}:${state.play.hands}:${state.play.balance}:${values.length}:${values[values.length - 1]}`;
    if (signature === lastBalanceChartSignature) return;
    lastBalanceChartSignature = signature;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const spread = Math.max(4, max - min);
    const low = min - spread * .18;
    const high = max + spread * .18;
    const left = 40, right = 12, top = 12, bottom = 12;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const xAt = index => left + (values.length === 1 ? 0 : index / (values.length - 1) * plotWidth);
    const yAt = value => top + (high - value) / (high - low || 1) * plotHeight;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(232,226,207,.72)";
    ctx.strokeStyle = "rgba(232,226,207,.14)";
    ctx.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
      const value = high - (high - low) * index / 4;
      const y = yAt(value);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(value)), 6, y + 4);
    }
    const zeroY = yAt(0);
    ctx.save();
    ctx.strokeStyle = "rgba(231,200,106,.4)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(width - right, zeroY);
    ctx.stroke();
    ctx.restore();
    const buildPath = () => {
      ctx.beginPath();
      values.forEach((value, index) => index === 0 ? ctx.moveTo(xAt(index), yAt(value)) : ctx.lineTo(xAt(index), yAt(value)));
    };
    if (values.length > 1) {
      const drawClippedLine = (clipTop, clipBottom, color) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipTop, width, Math.max(0, clipBottom - clipTop));
        ctx.clip();
        buildPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      };
      drawClippedLine(0, zeroY, "#4ccf79");
      drawClippedLine(zeroY, height, "#ff6b6b");
    }
    const lastIndex = values.length - 1;
    const lastValue = values[lastIndex];
    ctx.fillStyle = lastValue >= 0 ? "#4ccf79" : "#ff6b6b";
    ctx.beginPath();
    ctx.arc(xAt(lastIndex), yAt(lastValue), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function resetChallengeState() {
    state.challenge = { active: true, finished: false, completedHands: 0, correct: 0, misses: [], round: null };
  }

  function startChallenge() {
    resetChallengeState();
    el.challengeLaunch.classList.add("hidden");
    el.modeTabs.classList.add("hidden");
    Object.values(el.panels).forEach(panel => panel.classList.add("hidden"));
    el.challengePanel.classList.remove("hidden");
    el.challengeGame.classList.remove("hidden");
    el.challengeSummary.classList.add("hidden");
    newChallengeHand();
  }

  function newChallengeHand() {
    const challenge = state.challenge;
    if (!challenge.active || challenge.finished) return;
    if (challenge.completedHands >= 100) {
      finishChallenge();
      return;
    }
    challenge.round = newTrainRound("optimal");
    renderChallenge();
  }

  function challengePrompt(stage) {
    if (stage === "preflop") return "Choose Check or Raise 4x.";
    if (stage === "flop") return "Choose Check or Raise 2x.";
    return "Choose Call 1x or Fold.";
  }

  function renderChallenge() {
    const challenge = state.challenge;
    const round = challenge.round;
    if (!round) return;
    el.challengeProgress.textContent = `Hand ${challenge.completedHands + 1} of 100`;
    renderCommunityRow(el.challengeCommunity, round, true);
    renderCardRow(el.challengePlayer, round.playerCards, 2, 2);
    el.challengeActions.replaceChildren();
    if (!round.completed) availableActions(round.stage).forEach(item => el.challengeActions.append(actionButton(item, takeChallengeAction)));
    el.challengeMessage.textContent = challengePrompt(round.stage);
  }

  function completeChallengeHand(round) {
    const challenge = state.challenge;
    if (round.counted) return;
    round.counted = true;
    round.completed = true;
    challenge.completedHands += 1;
    if (round.perfect) challenge.correct += 1;
    else if (round.firstMistake) challenge.misses.push(mistakeSnapshot(round, challenge.completedHands));
    if (challenge.completedHands >= 100) {
      finishChallenge();
      return;
    }
    window.setTimeout(newChallengeHand, 120);
  }

  function takeChallengeAction(action) {
    const challenge = state.challenge;
    const round = challenge.round;
    if (!challenge.active || challenge.finished || !round || round.completed) return;
    if (!availableActions(round.stage).some(item => item.action === action)) return;

    // Challenge hands never reveal whether a decision was correct while the hand is active.
    // Grade only until the first mistake, then allow the player to finish naturally.
    if (round.scoringActive) {
      const optimal = gradeDecision(round, action);
      round.decisions.push({
        stage: round.stage,
        chosen: action,
        optimal: optimal.action,
        acceptable: optimal.acceptableActions.slice(),
        rule: optimal.rule || "",
        reference: optimal.reference ? { ...optimal.reference } : null
      });
    }

    if (round.stage === "preflop") {
      if (action === "check") { round.stage = "flop"; round.boardVisible = 3; }
      else completeChallengeHand(round);
    } else if (round.stage === "flop") {
      if (action === "check") { round.stage = "river"; round.boardVisible = 5; }
      else completeChallengeHand(round);
    } else {
      completeChallengeHand(round);
    }
    if (!round.completed) renderChallenge();
  }

  function challengeReviewMarkup(misses) {
    if (!misses.length) return "";
    return `<details class="mistake-review challenge-mistake-review"><summary>Review mistakes (${misses.length})</summary><div class="mistake-list">${misses.slice().reverse().map(mistake => {
      const board = mistake.board.length ? `<div class="mistake-card-group"><small>Board</small><div class="mistake-mini-hand">${mistake.board.map(miniCardMarkup).join("")}</div></div>` : "";
      return `<article class="mistake-card"><h3>Hand ${mistake.number} · ${STREET_LABELS[mistake.stage]}</h3><div class="mistake-visual"><div class="mistake-card-group"><small>Player</small><div class="mistake-mini-hand">${mistake.playerCards.map(miniCardMarkup).join("")}</div></div>${board}</div><div class="mistake-decision-grid"><div><small>Your play</small><strong class="mistake-chosen">${ACTION_LABELS[mistake.chosen]}</strong></div><div><small>Optimal play</small><strong class="mistake-optimal">${actionNames(mistake.acceptable)}</strong></div></div>${ruleFailureMarkup(mistake.reference, "Why this missed optimal play")}</article>`;
    }).join("")}</div></details>`;
  }

  function finishChallenge() {
    const challenge = state.challenge;
    challenge.finished = true;
    const percent = challenge.correct;
    const passed = challenge.correct >= 95;
    const perfect = challenge.correct === 100;
    const today = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date());
    let resultMarkup;
    if (perfect) {
      resultMarkup = `<div class="certificate grand-master"><div class="grand-master-rays" aria-hidden="true"></div><span class="certificate-corner top-left" aria-hidden="true">♠</span><span class="certificate-corner red top-right" aria-hidden="true">♥</span><span class="certificate-corner red bottom-left" aria-hidden="true">♦</span><span class="certificate-corner bottom-right" aria-hidden="true">♣</span><div class="grand-master-stars" aria-hidden="true">♠ · ♦ · ♣ · ♥</div><div class="certificate-small">CASA DEL JEFE · HALL OF MASTERS</div><div class="certificate-title">ULTIMATE HOLD’EM<br>GRAND MASTER</div><div class="certificate-rule"></div><p>This certifies a flawless performance in the 100-hand El Jefe Ultimate Hold’em Challenge.</p><div class="certificate-score">100 / 100 · 100%</div><div class="grand-master-seal" aria-hidden="true"><span>♛</span><small>100%</small></div><div class="grand-master-subtitle">Perfect Strategy</div><div class="certificate-signature">El Jefe</div><div class="certificate-signature-label">Certified by Casa del Jefe</div><p class="certificate-date">${today}</p><div class="certificate-share">Screenshot this Grand Master certificate and share it with the table.</div></div>`;
    } else if (passed) {
      resultMarkup = `<div class="certificate certificate-approved"><span class="certificate-corner top-left" aria-hidden="true">♠</span><span class="certificate-corner red top-right" aria-hidden="true">♥</span><span class="certificate-corner red bottom-left" aria-hidden="true">♦</span><span class="certificate-corner bottom-right" aria-hidden="true">♣</span><div class="certificate-small">CASA DEL JEFE · CERTIFICATE OF READINESS</div><div class="certificate-title">EL JEFE<br>APPROVED</div><div class="certificate-rule"></div><p>This certifies that the bearer completed the 100-hand El Jefe Ultimate Hold’em Challenge with:</p><div class="certificate-score">${challenge.correct} / 100 · ${percent.toFixed(1)}%</div><div class="approved-seal" aria-hidden="true"><span>♛</span><small>CERTIFIED</small></div><p class="certificate-declaration">Approved to play Ultimate Texas Hold’em at Casa del Jefe.</p><div class="certificate-signature">El Jefe</div><div class="certificate-signature-label">House Certification</div><p class="certificate-date">${today}</p><div class="certificate-share">Screenshot this certificate and share it with the table.</div></div>`;
    } else {
      const handsNeeded = 95 - challenge.correct;
      const handWord = handsNeeded === 1 ? "hand" : "hands";
      resultMarkup = `<div class="certificate certificate-not-yet"><span class="certificate-corner top-left" aria-hidden="true">♠</span><span class="certificate-corner red top-right" aria-hidden="true">♥</span><span class="certificate-corner red bottom-left" aria-hidden="true">♦</span><span class="certificate-corner bottom-right" aria-hidden="true">♣</span><div class="certificate-small">CASA DEL JEFE · CHALLENGE RESULTS</div><div class="certificate-title">NOT YET<br>CERTIFIED</div><div class="certificate-rule"></div><p>You completed the 100-hand El Jefe Ultimate Hold’em Challenge with:</p><div class="certificate-score">${challenge.correct} / 100 · ${percent.toFixed(1)}%</div><div class="not-yet-seal" aria-hidden="true"><span>♛</span><small>KEEP TRAINING</small></div><p class="certificate-declaration">Certification requires 95 correctly played hands. You are ${handsNeeded} ${handWord} away.</p><p>Review the first mistake from each missed hand, sharpen those decisions, and return to the challenge.</p><div class="certificate-signature">El Jefe</div><div class="certificate-signature-label">The table will be waiting</div><p class="certificate-date">${today}</p><div class="certificate-next-step">Review your mistakes below, then take another run at certification.</div></div>`;
    }
    el.challengeGame.classList.add("hidden");
    el.challengeSummary.innerHTML = `${resultMarkup}${challengeReviewMarkup(challenge.misses)}<div class="challenge-summary-actions"><button class="primary" id="challengeAgain" type="button">Try Again</button><button id="challengeDone" type="button">Done</button></div>`;
    el.challengeSummary.classList.remove("hidden");
    $("#challengeAgain").addEventListener("click", startChallenge);
    $("#challengeDone").addEventListener("click", exitChallenge);
  }

  function exitChallenge() {
    state.challenge.active = false;
    state.challenge.finished = false;
    state.challenge.round = null;
    el.challengePanel.classList.add("hidden");
    el.challengeLaunch.classList.remove("hidden");
    el.modeTabs.classList.remove("hidden");
    setMode(state.mode);
  }

  function setMode(mode) {
    state.mode = mode;
    if (el.challengePanel) el.challengePanel.classList.add("hidden");
    el.tabs.forEach(tab => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    Object.entries(el.panels).forEach(([name, panel]) => panel.classList.toggle("hidden", name !== mode));
    if (mode === "play") scheduleBalanceChartDraw();
    if (mode === "train") renderTrain();
    if (mode === "lookup") renderLookup();
  }

  function resetPlay() {
    if (state.play.round && state.play.round.animating) return;
    state.play = emptyPlay();
    localStorage.removeItem(PLAY_STORAGE_KEY);
    renderPlay();
  }

  function resetTrain() {
    state.train.sessions[state.train.strategy] = emptyTrainSession();
    state.train.round = null;
    saveTrain();
    renderTrain();
  }

  function changeTrainStrategy() {
    const strategy = el.trainStrategy.value;
    if (!Object.prototype.hasOwnProperty.call(TRAIN_STRATEGIES, strategy)) return;
    if (state.train.round && !state.train.round.completed) return;
    state.train.strategy = strategy;
    state.train.round = null;
    saveTrain();
    renderTrain();
  }

  el.tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  el.playDeal.addEventListener("click", startPlayHand);
  el.resetPlay.addEventListener("click", resetPlay);
  el.trainDeal.addEventListener("click", startTrainHand);
  el.trainStrategy.addEventListener("change", changeTrainStrategy);
  el.resetTrain.addEventListener("click", resetTrain);
  el.lookupRemove.addEventListener("click", removeLookupCard);
  el.lookupClear.addEventListener("click", clearLookup);
  el.lookupSearch.addEventListener("click", renderBestLookup);
  el.challengeLaunch.addEventListener("click", startChallenge);
  el.challengeExit.addEventListener("click", exitChallenge);

  window.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toUpperCase();
    const shortcuts = { C: "check", "4": "raise4", "2": "raise2", F: "fold", "1": "call1" };
    if (state.mode === "play" && shortcuts[key]) {
      event.preventDefault();
      takePlayAction(shortcuts[key]);
    } else if (state.mode === "train" && shortcuts[key]) {
      event.preventDefault();
      takeTrainAction(shortcuts[key]);
    } else if (state.challenge.active && !state.challenge.finished && shortcuts[key]) {
      event.preventDefault();
      takeChallengeAction(shortcuts[key]);
    } else if ((state.mode === "play" || state.mode === "train") && event.key === "Enter") {
      event.preventDefault();
      if (state.mode === "play" && !el.playDeal.disabled) startPlayHand();
      if (state.mode === "train" && !el.trainDeal.disabled) startTrainHand();
    }
  });

  window.UTHAppDebug = {
    startingHandClass,
    preflopDecision,
    elJefeFlopDecision,
    wizardFlopDecision,
    canonicalFlopKey,
    exactFlopDecision,
    exactRiverDecision,
    holeContributionInfo,
    elJefeRiverDecision,
    wizardRiverDecision,
    decisionForStrategy,
    decisionRuleReference,
    getTrainState() { return state.train; },
    setTrainStrategy(strategy) {
      if (!Object.prototype.hasOwnProperty.call(TRAIN_STRATEGIES, strategy)) throw new Error("Unknown strategy");
      if (state.train.round && !state.train.round.completed) throw new Error("Finish the active hand first");
      state.train.strategy = strategy;
      state.train.round = null;
      saveTrain();
      renderTrain();
    },
    startChallenge,
    exitChallenge,
    showChallengeScore(correct) {
      startChallenge();
      state.challenge.completedHands = 100;
      state.challenge.correct = Math.max(0, Math.min(100, Number(correct) || 0));
      state.challenge.misses = [];
      finishChallenge();
    }
  };

  buildPreflopChart();
  renderPlay();
  renderTrain();
  renderLookup();

  if ("ResizeObserver" in window && el.playChart) {
    const chartObserver = new ResizeObserver(() => {
      lastBalanceChartSignature = "";
      scheduleBalanceChartDraw();
    });
    chartObserver.observe(el.playChart);
  } else {
    window.addEventListener("resize", () => {
      lastBalanceChartSignature = "";
      scheduleBalanceChartDraw();
    }, { passive: true });
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) window.location.reload();
    });
    navigator.serviceWorker.register("./service-worker.js?v=16").then(registration => {
      const showWaiting = worker => {
        if (!worker || worker.state !== "installed" || !navigator.serviceWorker.controller) return;
        el.updateNotice.classList.remove("hidden");
        el.reloadUpdate.onclick = () => {
          reloadingForUpdate = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        };
      };
      if (registration.waiting) showWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (worker) worker.addEventListener("statechange", () => showWaiting(worker));
      });
    }).catch(error => console.warn("Service worker registration failed.", error));
  }
})();
