"use strict";

(() => {
  const APP_VERSION = "7";
  const E = window.UltimateHoldemEngine;
  const D = window.UTHStrategyData;
  if (!E) throw new Error("UltimateHoldemEngine did not load.");
  if (!D) throw new Error("UTHStrategyData did not load.");

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const PLAY_STORAGE_KEY = "casaUltimateHoldemPlayV2";
  const TRAIN_STORAGE_KEY = "casaUltimateHoldemTrainV1";
  const SUIT_CLASSES = ["suit-hearts", "suit-diamonds", "suit-clubs", "suit-spades"];
  const RANK_CHARS = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  const CHART_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const ACTION_LABELS = {
    check: "Check",
    raise3: "Raise 3x",
    raise4: "Raise 4x",
    raise2: "Raise 2x",
    call1: "Call 1x",
    fold: "Fold"
  };
  const STREET_LABELS = { preflop: "Preflop", flop: "Flop", river: "River" };
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
    playStrategyFeedback: $("#playStrategyFeedback"),
    playActions: $("#playActions"),
    playDeal: $("#playDeal"),
    playChart: $("#playBalanceChart"),
    playDeltaSummary: $("#playDeltaSummary"),
    completedHands: $("#completedHands"),
    playPerfectHands: $("#playPerfectHands"),
    playWins: $("#playWins"),
    playPushes: $("#playPushes"),
    playLosses: $("#playLosses"),
    resetPlay: $("#resetPlay"),

    trainHands: $("#trainHands"),
    trainAccuracy: $("#trainAccuracy"),
    trainStreet: $("#trainStreet"),
    trainCommunity: $("#trainCommunity"),
    trainPlayer: $("#trainPlayer"),
    trainMessage: $("#trainMessage"),
    trainFeedback: $("#trainFeedback"),
    trainActions: $("#trainActions"),
    trainDeal: $("#trainDeal"),
    trainCompletedHands: $("#trainCompletedHands"),
    trainPerfectHands: $("#trainPerfectHands"),
    trainPreflopErrors: $("#trainPreflopErrors"),
    trainFlopErrors: $("#trainFlopErrors"),
    trainRiverErrors: $("#trainRiverErrors"),
    resetTrain: $("#resetTrain"),

    lookupStreetTabs: $$(".lookup-street"),
    lookupBoardGroup: $("#lookupBoardGroup"),
    lookupBoardHelp: $("#lookupBoardHelp"),
    lookupPlayerSlots: $("#lookupPlayerSlots"),
    lookupBoardSlots: $("#lookupBoardSlots"),
    lookupPickerLabel: $("#lookupPickerLabel"),
    lookupRankPicker: $("#lookupRankPicker"),
    lookupSuitPicker: $("#lookupSuitPicker"),
    lookupRemove: $("#lookupRemove"),
    lookupClear: $("#lookupClear"),
    lookupMessage: $("#lookupMessage"),
    lookupResult: $("#lookupResult"),
    strategySelectorRow: $("#strategySelectorRow"),
    lookupStrategy: $("#lookupStrategy"),
    lookupStrategyResult: $("#lookupStrategyResult"),
    preflopChartContainer: $("#preflopChartContainer"),

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
      street: "preflop",
      cards: Array(7).fill(null),
      activeSlot: 0,
      pendingRank: null
    }
  };

  function emptyPlay() {
    return { balance: 0, hands: 0, perfectHands: 0, wins: 0, pushes: 0, losses: 0, history: [0], round: null };
  }

  function emptyTrain() {
    return { hands: 0, perfectHands: 0, errors: { preflop: 0, flop: 0, river: 0 }, round: null };
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
        history: Array.isArray(saved.history) && saved.history.length ? saved.history.map(Number) : [0]
      };
    } catch (error) {
      console.warn("Could not load Ultimate Hold'em play session.", error);
      return emptyPlay();
    }
  }

  function loadTrain() {
    try {
      const saved = JSON.parse(localStorage.getItem(TRAIN_STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return emptyTrain();
      return {
        ...emptyTrain(),
        hands: Number(saved.hands) || 0,
        perfectHands: Number(saved.perfectHands) || 0,
        errors: {
          preflop: Number(saved.errors && saved.errors.preflop) || 0,
          flop: Number(saved.errors && saved.errors.flop) || 0,
          river: Number(saved.errors && saved.errors.river) || 0
        }
      };
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
        history: state.play.history.slice(-301)
      }));
    } catch (error) {
      console.warn("Could not save Ultimate Hold'em play session.", error);
    }
  }

  function saveTrain() {
    try {
      localStorage.setItem(TRAIN_STORAGE_KEY, JSON.stringify({
        hands: state.train.hands,
        perfectHands: state.train.perfectHands,
        errors: state.train.errors
      }));
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
      rule = "Raise with a hidden pair from a non-pocket starting hand.";
    } else if (pocket && evaluation.category >= 3) {
      action = "raise2";
      rule = "With pocket deuces, raise when the flop makes a set or better.";
    } else if (flush.fourFlush && flush.hiddenRank >= 10) {
      action = "raise2";
      rule = "Raise with four to a flush containing a hidden ten or higher.";
      const bareOffsuitTen = /^T[2-9]o$/.test(classLabel) && evaluation.category === 0 && straightOutCards === 0 && flush.hiddenRank === 10;
      if (bareOffsuitTen) {
        action = "check";
        rule = "Check the bare ten-high flush draw with an offsuit Tx hand when there is no pair or one-card straight draw.";
      }
    }

    if (action === "check" && ["T9o", "T9s", "J9o"].includes(classLabel) && straightOutCards === 8 && !(board.maxRank < holeLow)) {
      action = "raise2";
      rule = "With T9 or J9, raise an eight-out straight draw unless both hole cards are higher than every flop card.";
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
    if (flush.fourFlush && flush.hiddenRank >= 10) return { action: "raise2", rule: "Raise with four to a flush containing a hidden ten or higher." };
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

  function optimalForStage(stage, playerCards, board) {
    if (stage === "preflop") return preflopDecision(playerCards);
    if (stage === "flop") return exactFlopDecision(playerCards, board.slice(0, 3));
    if (stage === "river") return exactRiverDecision(playerCards, board.slice(0, 5));
    throw new Error(`Unknown stage ${stage}.`);
  }

  function availableActions(stage, disabled = false) {
    if (disabled) return [];
    if (stage === "preflop") return [
      { action: "check", key: "C", label: "Check" },
      { action: "raise3", key: "3", label: "Raise 3x" },
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

  function gradeDecision(round, action) {
    if (!round.scoringActive) return null;
    const optimal = optimalForStage(round.stage, round.playerCards, round.board);
    if (!optimal.acceptableActions.includes(action)) {
      round.perfect = false;
      round.scoringActive = false;
      round.firstMistake = {
        stage: round.stage,
        chosen: action,
        optimal: optimal.action,
        acceptable: optimal.acceptableActions.slice()
      };
    }
    return optimal;
  }

  function mistakeText(mistake) {
    if (!mistake) return "";
    const optimal = mistake.acceptable.length > 1
      ? mistake.acceptable.map(action => ACTION_LABELS[action]).join(" or ")
      : ACTION_LABELS[mistake.optimal];
    return `First mistake: ${STREET_LABELS[mistake.stage]}. You chose ${ACTION_LABELS[mistake.chosen]}; optimal play was ${optimal}.`;
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
    renderPlayFeedback(round);
    if (action === "check") {
      if (round.stage === "preflop") await revealFlop(round);
      else if (round.stage === "flop") await revealTurnAndRiver(round);
      return;
    }
    if (action === "fold") {
      await resolveFold(round);
      return;
    }
    const multipliers = { raise3: 3, raise4: 4, raise2: 2, call1: 1 };
    await resolveShowdown(round, multipliers[action]);
  }

  function completePlayHand() {
    const p = state.play;
    const round = p.round;
    const net = Number(round && round.result && round.result.net);
    p.hands += 1;
    if (round.perfect) p.perfectHands += 1;
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
      if (round.stage === "preflop") return { text: "Choose Check, Raise 3x, or Raise 4x.", tone: "neutral" };
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

  function renderPlayFeedback(round) {
    const text = round && round.firstMistake ? `${mistakeText(round.firstMistake)} Later choices do not affect this hand’s accuracy.` : "";
    el.playStrategyFeedback.textContent = text;
    el.playStrategyFeedback.classList.toggle("hidden", !text);
    el.playStrategyFeedback.classList.toggle("correct", Boolean(round && round.completed && round.perfect));
    if (round && round.completed && round.perfect) {
      el.playStrategyFeedback.textContent = "Perfect strategy hand — every decision matched exact optimal play.";
      el.playStrategyFeedback.classList.remove("hidden");
    }
  }

  function renderPlayControls(round) {
    renderPlayActions(round);
    const message = playMessageForRound(round);
    el.playMessage.textContent = message.text;
    el.playMessage.classList.remove("win", "loss");
    if (message.tone !== "neutral") el.playMessage.classList.add(message.tone);
    renderPlayFeedback(round);
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
    el.playPerfectHands.textContent = String(p.perfectHands);
    el.playWins.textContent = String(p.wins);
    el.playPushes.textContent = String(p.pushes);
    el.playLosses.textContent = String(p.losses);
    const completedRound = p.round && p.round.completed ? p.round : null;
    el.playDecisionIndicator.classList.toggle("correct", Boolean(completedRound && completedRound.perfect));
    el.playDecisionIndicator.classList.toggle("incorrect", Boolean(completedRound && !completedRound.perfect));
    el.playDeltaSummary.textContent = p.hands ? `${p.perfectHands} of ${p.hands} hands played perfectly.` : "Accuracy is scored by perfectly played hands.";
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

  function newTrainRound() {
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
      lastOptimal: null
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
    state.train.hands += 1;
    if (round.perfect) state.train.perfectHands += 1;
    else if (round.firstMistake) state.train.errors[round.firstMistake.stage] += 1;
    saveTrain();
  }

  function takeTrainAction(action) {
    const round = state.train.round;
    if (!round || round.completed) return;
    if (!availableActions(round.stage).some(item => item.action === action)) return;
    const optimal = gradeDecision(round, action);
    round.lastOptimal = optimal;
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
    const t = state.train;
    const round = t.round;
    renderCommunityRow(el.trainCommunity, round, true);
    renderCardRow(el.trainPlayer, round && round.playerCards, round ? 2 : 0, 2);
    renderTrainActions(round);
    el.trainHands.textContent = String(t.hands);
    el.trainAccuracy.textContent = formatPercent(t.perfectHands, t.hands);
    el.trainStreet.textContent = round && !round.completed ? STREET_LABELS[round.stage] : "—";
    el.trainCompletedHands.textContent = String(t.hands);
    el.trainPerfectHands.textContent = String(t.perfectHands);
    el.trainPreflopErrors.textContent = String(t.errors.preflop);
    el.trainFlopErrors.textContent = String(t.errors.flop);
    el.trainRiverErrors.textContent = String(t.errors.river);
    el.trainDeal.disabled = Boolean(round && !round.completed);
    el.trainDeal.textContent = round && round.completed ? "Deal Next" : "Deal";
    el.trainFeedback.classList.remove("correct");
    if (!round) {
      el.trainMessage.textContent = "Press Deal to begin a decision hand.";
      el.trainFeedback.classList.add("hidden");
    } else if (round.completed && round.perfect) {
      el.trainMessage.textContent = "Perfect hand.";
      el.trainFeedback.textContent = "Every decision matched exact optimal play.";
      el.trainFeedback.classList.remove("hidden");
      el.trainFeedback.classList.add("correct");
    } else if (round.completed && round.firstMistake) {
      el.trainMessage.textContent = "Training hand ended at the first mistake.";
      el.trainFeedback.textContent = mistakeText(round.firstMistake);
      el.trainFeedback.classList.remove("hidden");
    } else {
      const prompts = {
        preflop: "Choose Check, Raise 3x, or Raise 4x.",
        flop: "Choose Check or Raise 2x.",
        river: "Choose Call 1x or Fold."
      };
      el.trainMessage.textContent = prompts[round.stage];
      el.trainFeedback.classList.add("hidden");
    }
  }

  function lookupRequiredIndices() {
    if (state.lookup.street === "preflop") return [0, 1];
    if (state.lookup.street === "flop") return [0, 1, 2, 3, 4];
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function lookupComplete() {
    return lookupRequiredIndices().every(index => state.lookup.cards[index]);
  }

  function nextLookupEmpty() {
    return lookupRequiredIndices().find(index => !state.lookup.cards[index]);
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
    const count = state.lookup.street === "flop" ? 3 : state.lookup.street === "river" ? 5 : 0;
    for (let index = 0; index < count; index += 1) el.lookupBoardSlots.append(lookupSlotButton(index + 2, `Community card ${index + 1}`));
    el.lookupBoardGroup.classList.toggle("hidden", count === 0);
    el.lookupBoardHelp.textContent = count === 3 ? "Choose the three flop cards" : "Choose all five board cards";
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
    if (next !== undefined) state.lookup.activeSlot = next;
    renderLookup();
  }

  function clearLookup() {
    state.lookup.cards = Array(7).fill(null);
    state.lookup.activeSlot = 0;
    state.lookup.pendingRank = null;
    renderLookup();
  }

  function removeLookupCard() {
    if (state.lookup.activeSlot === null) return;
    state.lookup.cards[state.lookup.activeSlot] = null;
    state.lookup.pendingRank = null;
    renderLookup();
  }

  function setLookupStreet(street) {
    state.lookup.street = street;
    state.lookup.cards = Array(7).fill(null);
    state.lookup.activeSlot = 0;
    state.lookup.pendingRank = null;
    renderLookup();
  }

  function actionBadge(action) {
    return `<span class="lookup-action-badge action-${action}">${ACTION_LABELS[action]}</span>`;
  }

  function renderExactLookup() {
    el.lookupResult.classList.add("hidden");
    el.strategySelectorRow.classList.add("hidden");
    el.lookupStrategyResult.classList.add("hidden");
    el.lookupMessage.classList.remove("error");
    if (!lookupComplete()) {
      el.lookupMessage.textContent = "Complete the visible cards to calculate the decision.";
      return;
    }
    const playerCards = state.lookup.cards.slice(0, 2);
    const board = state.lookup.cards.slice(2).filter(Boolean);
    const street = state.lookup.street;
    let html = "";
    let reachable = true;

    if (street === "preflop") {
      const result = preflopDecision(playerCards);
      html = `<div class="lookup-verdict"><strong>Optimal Play</strong>${actionBadge(result.action)}<span>${result.classLabel}${result.provisional ? " · pending final audit confirmation" : " · exact certified result"}</span></div>`;
    } else if (street === "flop") {
      const pre = preflopDecision(playerCards);
      if (pre.action === "raise4") {
        reachable = false;
        html = `<div class="lookup-verdict warning"><strong>Unreachable Under Optimal Play</strong><span>${pre.classLabel} should raise 4x preflop, so an optimal player never faces this flop decision.</span></div>`;
      } else {
        const result = exactFlopDecision(playerCards, board);
        html = `<div class="lookup-verdict"><strong>Optimal Play</strong>${actionBadge(result.action)}<span>Exact rule-plus-exception lookup${result.exception ? " · this is an El Jefe strategy exception" : ""}</span></div>`;
      }
    } else {
      const exact = exactRiverDecision(playerCards, board);
      const pre = preflopDecision(playerCards);
      let pathText = "This river is reachable through optimal prior checks.";
      if (pre.action === "raise4") {
        reachable = false;
        pathText = `Off optimal path: ${pre.classLabel} should raise 4x preflop.`;
      } else {
        const flop = exactFlopDecision(playerCards, board.slice(0, 3));
        if (flop.action === "raise2") {
          reachable = false;
          pathText = "Off optimal path: exact play raises 2x on the flop.";
        }
      }
      const tieText = exact.indifferent ? "Call and Fold have identical EV." : `Calling is ${exact.margin >= 0 ? "better" : "worse"} by ${Math.abs(exact.margin).toFixed(4)} units.`;
      html = `<div class="lookup-verdict${reachable ? "" : " warning"}"><strong>Optimal Play</strong>${actionBadge(exact.action)}<span>${pathText}</span></div><div class="lookup-ev-grid"><div><small>Call EV</small><strong>${exact.callEV.toFixed(4)}</strong></div><div><small>Fold EV</small><strong>-2.0000</strong></div><div><small>Dealer hands</small><strong>${exact.combinations}</strong></div></div><p class="lookup-explanation">${tieText} Dealer outcomes: ${exact.wins} wins for the player, ${exact.ties} ties, and ${exact.losses} losses.</p>`;
    }

    el.lookupResult.innerHTML = html;
    el.lookupResult.classList.remove("hidden");
    el.lookupMessage.textContent = reachable ? "Decision calculated." : street === "river" ? "Exact river action calculated despite the earlier off-path decision." : "Earlier optimal play prevents this decision.";
    if (street !== "preflop" && (street === "river" || reachable)) {
      el.strategySelectorRow.classList.remove("hidden");
      renderSimplifiedLookup();
    }
  }

  function renderSimplifiedLookup() {
    if (!lookupComplete() || state.lookup.street === "preflop") {
      el.lookupStrategyResult.classList.add("hidden");
      return;
    }
    const playerCards = state.lookup.cards.slice(0, 2);
    const board = state.lookup.cards.slice(2).filter(Boolean);
    const strategy = el.lookupStrategy.value;
    let title;
    let result;
    let note = "";

    if (state.lookup.street === "flop") {
      if (strategy === "jefe") {
        title = "El Jefe Strategy — Intermediate";
        result = elJefeFlopDecision(playerCards, board);
        note = `This strategy reduced the Wizard flop strategy’s exact EV loss by ${D.flopPenaltyReductionPercent.toFixed(2)}%.`;
      } else {
        title = "Wizard of Odds Strategy — Beginner";
        result = wizardFlopDecision(playerCards, board);
        note = "This is the simpler published basic strategy.";
      }
    } else if (strategy === "jefe") {
      title = "El Jefe Strategy — Intermediate";
      el.lookupStrategyResult.innerHTML = `<div class="strategy-result-heading"><strong>${title}</strong><span class="development-pill">River in development</span></div><p>The intermediate river rule is still being analyzed. Exact optimal play remains available above, and the Wizard beginner rule can be selected now.</p>`;
      el.lookupStrategyResult.classList.remove("hidden");
      return;
    } else {
      title = "Wizard of Odds Strategy — Beginner";
      result = wizardRiverDecision(playerCards, board);
      note = `One-card dealer outs that beat you: ${result.outs.beats} of ${result.outs.total}.`;
    }

    const exact = state.lookup.street === "flop" ? exactFlopDecision(playerCards, board).action : exactRiverDecision(playerCards, board).action;
    const agreement = result.action === exact ? "Agrees with optimal play." : "Differs from optimal play in this situation.";
    el.lookupStrategyResult.innerHTML = `<div class="strategy-result-heading"><strong>${title}</strong>${actionBadge(result.action)}</div><p>${result.rule}</p><p class="strategy-agreement ${result.action === exact ? "agrees" : "differs"}">${agreement}</p><small>${note}</small>`;
    el.lookupStrategyResult.classList.remove("hidden");
  }

  function renderLookup() {
    el.lookupStreetTabs.forEach(button => {
      const active = button.dataset.street === state.lookup.street;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    renderLookupSlots();
    buildLookupPickers();
    const required = lookupRequiredIndices();
    if (!required.includes(state.lookup.activeSlot)) state.lookup.activeSlot = required[0];
    const slotLabel = state.lookup.activeSlot < 2 ? `player card ${state.lookup.activeSlot + 1}` : `community card ${state.lookup.activeSlot - 1}`;
    el.lookupPickerLabel.textContent = state.lookup.pendingRank === null ? `Choose a rank for ${slotLabel}` : `Choose a suit for ${E.RANK_LABELS[state.lookup.pendingRank]}`;
    el.lookupRemove.disabled = !state.lookup.cards[state.lookup.activeSlot];
    renderExactLookup();
  }

  function buildPreflopChart() {
    const table = document.createElement("table");
    table.className = "preflop-strategy-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = `<th class="corner-cell">Cards</th>${CHART_RANKS.map(rank => `<th>${rank}</th>`).join("")}`;
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    for (const rowRank of CHART_RANKS) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      rowHeader.textContent = rowRank;
      row.append(rowHeader);
      for (const colRank of CHART_RANKS) {
        const cell = document.createElement("td");
        const rowValue = CHART_RANKS.length - CHART_RANKS.indexOf(rowRank);
        const colValue = CHART_RANKS.length - CHART_RANKS.indexOf(colRank);
        const high = rowValue >= colValue ? rowRank : colRank;
        const low = rowValue >= colValue ? colRank : rowRank;
        const key = high === low ? high + low : high + low;
        const category = D.preflopChart[key];
        const code = category === "always" ? "4X" : category === "suited" ? "4X S" : "C";
        const button = document.createElement("button");
        button.type = "button";
        button.className = `preflop-chart-cell cell-${category}`;
        button.textContent = code;
        const detail = category === "always" ? "Raise 4x suited or offsuit" : category === "suited" ? "Raise 4x only when suited; check offsuit" : "Check suited or offsuit";
        button.title = `${high}${low}: ${detail}`;
        button.addEventListener("click", () => {
          el.lookupMessage.textContent = `${high}${low}: ${detail}.`;
          el.lookupMessage.classList.remove("error");
        });
        cell.append(button);
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

  function setMode(mode) {
    state.mode = mode;
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
    state.train = emptyTrain();
    localStorage.removeItem(TRAIN_STORAGE_KEY);
    renderTrain();
  }

  el.tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  el.playDeal.addEventListener("click", startPlayHand);
  el.resetPlay.addEventListener("click", resetPlay);
  el.trainDeal.addEventListener("click", startTrainHand);
  el.resetTrain.addEventListener("click", resetTrain);
  el.lookupStreetTabs.forEach(button => button.addEventListener("click", () => setLookupStreet(button.dataset.street)));
  el.lookupRemove.addEventListener("click", removeLookupCard);
  el.lookupClear.addEventListener("click", clearLookup);
  el.lookupStrategy.addEventListener("change", renderSimplifiedLookup);

  window.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toUpperCase();
    const shortcuts = { C: "check", "3": "raise3", "4": "raise4", "2": "raise2", F: "fold", "1": "call1" };
    if (state.mode === "play" && shortcuts[key]) {
      event.preventDefault();
      takePlayAction(shortcuts[key]);
    } else if (state.mode === "train" && shortcuts[key]) {
      event.preventDefault();
      takeTrainAction(shortcuts[key]);
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
    wizardRiverDecision
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
    navigator.serviceWorker.register("./service-worker.js?v=7").then(registration => {
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
