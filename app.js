"use strict";

(() => {
  const E = window.UltimateHoldemEngine;
  if (!E) throw new Error("UltimateHoldemEngine did not load.");

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = "casaUltimateHoldemPlayV1";
  const SUIT_CLASSES = ["suit-hearts", "suit-diamonds", "suit-clubs", "suit-spades"];
  const WINDOW_PAUSE = 78;
  const DEAL_SLIDE_DURATION = 175;
  const DEAL_SETTLE_DELAY = 18;

  const el = {
    tabs: $$(".mode-tab"),
    panels: { play: $("#playPanel"), train: $("#trainPanel"), lookup: $("#lookupPanel") },
    playBalance: $("#playBalance"),
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
    playChartSummary: $("#playChartSummary"),
    playDeltaSummary: $("#playDeltaSummary"),
    completedHands: $("#completedHands"),
    sessionResult: $("#sessionResult"),
    resetPlay: $("#resetPlay")
  };

  const state = {
    mode: "play",
    play: loadPlay()
  };

  function emptyPlay() {
    return { balance: 0, hands: 0, history: [0], round: null };
  }

  function loadPlay() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return emptyPlay();
      return {
        ...emptyPlay(),
        balance: Number(saved.balance) || 0,
        hands: Number(saved.hands) || 0,
        history: Array.isArray(saved.history) && saved.history.length ? saved.history.map(Number) : [0]
      };
    } catch (error) {
      console.warn("Could not load Ultimate Hold'em session.", error);
      return emptyPlay();
    }
  }

  function savePlay() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        balance: state.play.balance,
        hands: state.play.hands,
        history: state.play.history.slice(-301)
      }));
    } catch (error) {
      console.warn("Could not save Ultimate Hold'em session.", error);
    }
  }

  function formatNumber(value) {
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return value.toFixed(1).replace(/\.0$/, "");
  }

  function formatUnits(value, signed = false) {
    const sign = signed && value > 0 ? "+" : "";
    return `${sign}${formatNumber(value)} ${Math.abs(value) === 1 ? "unit" : "units"}`;
  }

  function cardElement(card, { back = false, placeholder = false, revealing = false } = {}) {
    const node = document.createElement("div");
    node.className = `card${back ? " card-back" : ""}${placeholder ? " placeholder" : ""}${revealing ? " card-revealing" : ""}`;
    if (placeholder) {
      node.textContent = "";
      node.setAttribute("aria-label", "Empty card slot");
    } else if (back) {
      node.setAttribute("aria-label", "Face-down card");
    } else {
      const suitClass = SUIT_CLASSES[card.suit];
      node.classList.add(suitClass);
      node.innerHTML = `
        <span class="card-suit card-suit-top ${suitClass}">${E.SUITS[card.suit]}</span>
        <span class="card-rank ${suitClass}">${E.RANK_LABELS[card.rank]}</span>
        <span class="card-suit card-suit-bottom ${suitClass}">${E.SUITS[card.suit]}</span>`;
      node.setAttribute("aria-label", E.labelCard(card));
    }
    return node;
  }

  function renderCardRow(container, cards, visibleCount, totalCount) {
    container.replaceChildren();
    for (let i = 0; i < totalCount; i += 1) {
      const card = cards && cards[i];
      if (!card) container.append(cardElement(null, { placeholder: true }));
      else container.append(cardElement(card, { back: i >= visibleCount }));
    }
  }

  function mappedBoardCards(board) {
    return board ? [board[3], board[4], board[0], board[1], board[2]] : null;
  }

  function renderDealerRow(round) {
    const cards = round && round.dealerCards;
    const visibleCount = round ? round.dealerVisible : 0;
    const hiddenSlots = new Set(round ? round.dealerHiddenSlots : []);
    el.playDealer.replaceChildren();
    for (let i = 0; i < 2; i += 1) {
      const card = cards && cards[i];
      const node = !card
        ? cardElement(null, { placeholder: true })
        : cardElement(card, { back: i >= visibleCount });
      if (hiddenSlots.has(i)) node.classList.add("uth-deal-hidden");
      el.playDealer.append(node);
    }
  }

  function renderCommunityRow(round) {
    const cards = mappedBoardCards(round && round.board);
    const visibleSlots = new Set(
      !round ? [] : round.boardVisible >= 5 ? [0, 1, 2, 3, 4] : round.boardVisible >= 3 ? [2, 3, 4] : []
    );
    const hiddenSlots = new Set(round ? round.boardHiddenSlots : []);
    el.playCommunity.replaceChildren();
    for (let i = 0; i < 5; i += 1) {
      const card = cards && cards[i];
      const node = !card
        ? cardElement(null, { placeholder: true })
        : cardElement(card, { back: !visibleSlots.has(i) });
      if (hiddenSlots.has(i)) node.classList.add("uth-deal-hidden");
      el.playCommunity.append(node);
    }
  }

  function newRound() {
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
      result: null
    };
  }

  function startPlayHand() {
    if (state.play.round && !state.play.round.completed) return;
    const round = newRound();
    state.play.balance -= 2;
    state.play.round = round;
    renderPlay();
  }

  function availableActions(round) {
    if (!round || round.completed || round.animating) return [];
    if (round.stage === "preflop") return [
      { action: "check", key: "C", label: "Check" },
      { action: "raise3", key: "3", label: "Raise 3x" },
      { action: "raise4", key: "4", label: "Raise 4x" }
    ];
    if (round.stage === "flop") return [
      { action: "check", key: "C", label: "Check" },
      { action: "raise2", key: "2", label: "Raise 2x" }
    ];
    if (round.stage === "river") return [
      { action: "fold", key: "F", label: "Fold" },
      { action: "call1", key: "1", label: "Call 1x" }
    ];
    return [];
  }

  function sleep(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function nextFrame() {
    return new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  }

  function pinDealCard(node, slot) {
    node.style.left = `${slot.offsetLeft}px`;
    node.style.top = `${slot.offsetTop}px`;
    node.style.width = `${slot.offsetWidth}px`;
    node.style.height = `${slot.offsetHeight}px`;
  }

  async function animateDealPacket(round, { container, cards, targetSlots, hiddenField, message }) {
    round.animating = true;
    round.revealText = message;
    round[hiddenField] = [...targetSlots];
    renderPlay();
    await nextFrame();
    if (state.play.round !== round) return false;

    const slots = [...container.children];
    const stackSlot = slots[targetSlots[targetSlots.length - 1]];
    if (!stackSlot) return false;

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
      renderPlay();
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
      renderPlay();
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
    renderPlay();
    return true;
  }

  async function resolveShowdown(round, multiplier) {
    round.playMultiplier = multiplier;
    state.play.balance -= multiplier;
    round.stage = "showdown";

    if (round.boardVisible < 3 && !await revealFlop(round)) return;
    if (round.boardVisible < 5 && !await revealTurnAndRiver(round)) return;
    if (!await revealDealer(round)) return;

    round.result = E.settleHand({
      playerCards: round.playerCards,
      dealerCards: round.dealerCards,
      board: round.board,
      playMultiplier: multiplier
    });
    state.play.balance += round.result.returned;
    round.completed = true;
    round.animating = false;
    round.revealText = "";
    round.stage = "complete";
    completeHand();
  }

  async function resolveFold(round) {
    round.folded = true;
    round.stage = "showdown";
    if (!await revealDealer(round, "Folded — revealing the dealer cards...")) return;
    round.result = {
      net: state.play.balance - round.balanceBefore,
      winner: "fold",
      dealer: E.evaluateSeven([...round.dealerCards, ...round.board])
    };
    round.completed = true;
    round.animating = false;
    round.revealText = "";
    round.stage = "complete";
    completeHand();
  }

  async function takeAction(action) {
    const round = state.play.round;
    if (!round || round.completed || round.animating) return;
    const permitted = availableActions(round).some(item => item.action === action);
    if (!permitted) return;

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

  function completeHand() {
    state.play.hands += 1;
    state.play.history.push(state.play.balance);
    if (state.play.history.length > 301) state.play.history.shift();
    savePlay();
    renderPlay();
  }

  function renderChipStack(container, count) {
    container.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const chip = document.createElement("span");
      chip.className = "uth-chip";
      chip.style.setProperty("--chip-index", String(i));
      chip.style.setProperty("--chip-center", String((count - 1) / 2));
      chip.setAttribute("aria-hidden", "true");
      container.append(chip);
    }
    container.parentElement.classList.toggle("has-chips", count > 0);
    container.parentElement.setAttribute("aria-label", count ? `${count} unit${count === 1 ? "" : "s"} wagered` : `${container.parentElement.textContent.trim()} wager empty`);
  }

  function renderWagers(round) {
    const handActive = Boolean(round);
    renderChipStack(el.anteChips, handActive ? 1 : 0);
    renderChipStack(el.blindChips, handActive ? 1 : 0);
    renderChipStack(el.playChips, round ? round.playMultiplier : 0);
  }

  function messageForRound(round) {
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
    const blindText = result.winner === "player"
      ? result.blindOdds > 0
        ? ` Blind pays ${formatNumber(result.blindOdds)} to 1.`
        : " Blind pushes."
      : "";

    if (result.winner === "tie") {
      return { text: `Push — both finish with ${result.player.name}. Net 0 units.`, tone: "neutral" };
    }
    if (result.winner === "player") {
      return { text: `You win with ${result.player.name}; dealer has ${result.dealer.name}. ${qualification}${blindText} Net ${formatUnits(result.net, true)}.`, tone: "win" };
    }
    return { text: `Dealer wins with ${result.dealer.name}; you have ${result.player.name}. ${qualification} Net ${formatUnits(result.net, true)}.`, tone: "loss" };
  }

  function renderActions(round) {
    el.playActions.replaceChildren();
    availableActions(round).forEach(({ action, key, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `uth-action-button action-${action}`;
      button.dataset.action = action;
      button.setAttribute("aria-label", `${label}; keyboard shortcut ${key}`);
      const keyNode = document.createElement("span");
      keyNode.className = "uth-action-key";
      keyNode.textContent = key;
      const labelNode = document.createElement("span");
      labelNode.className = "uth-action-label";
      labelNode.textContent = label;
      button.append(keyNode, labelNode);
      button.addEventListener("click", () => takeAction(action));
      el.playActions.append(button);
    });
  }

  function renderPlay() {
    const p = state.play;
    const round = p.round;
    renderDealerRow(round);
    renderCommunityRow(round);
    renderCardRow(el.playPlayer, round && round.playerCards, round ? 2 : 0, 2);
    renderWagers(round);
    renderActions(round);

    const message = messageForRound(round);
    el.playMessage.textContent = message.text;
    el.playMessage.classList.remove("win", "loss");
    if (message.tone !== "neutral") el.playMessage.classList.add(message.tone);

    el.playBalance.textContent = formatUnits(p.balance);
    el.completedHands.textContent = String(p.hands);
    el.sessionResult.textContent = formatUnits(p.balance, p.balance > 0);
    el.playChartSummary.textContent = `${p.hands} completed ${p.hands === 1 ? "hand" : "hands"}`;
    el.playDeltaSummary.textContent = `Session result: ${formatUnits(p.balance, p.balance > 0)}`;
    el.playDeal.disabled = Boolean(round && !round.completed);
    el.playDeal.textContent = round && round.completed ? "Deal Again" : "Deal";
    requestAnimationFrame(drawBalanceChart);
  }

  function drawBalanceChart() {
    const canvas = el.playChart;
    if (!canvas || canvas.offsetParent === null) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(280, rect.width);
    const height = Math.max(160, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const values = state.play.history.length ? state.play.history : [0];
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const spread = Math.max(4, max - min);
    const low = min - spread * 0.18;
    const high = max + spread * 0.18;
    const left = 42;
    const right = 14;
    const top = 14;
    const bottom = 27;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const xAt = index => left + (values.length === 1 ? 0 : (index / (values.length - 1)) * plotWidth);
    const yAt = value => top + ((high - value) / (high - low || 1)) * plotHeight;

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(232, 226, 207, .76)";
    ctx.strokeStyle = "rgba(232, 226, 207, .14)";
    ctx.lineWidth = 1;
    const ticks = 4;
    for (let i = 0; i <= ticks; i += 1) {
      const value = high - ((high - low) * i) / ticks;
      const y = yAt(value);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(formatNumber(value), 5, y + 4);
    }

    ctx.strokeStyle = "#e3b94f";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = xAt(index);
      const y = yAt(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lastIndex = values.length - 1;
    ctx.fillStyle = "#e3b94f";
    ctx.beginPath();
    ctx.arc(xAt(lastIndex), yAt(values[lastIndex]), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(232, 226, 207, .76)";
    ctx.fillText("Hands", width - 44, height - 7);
  }

  function setMode(mode) {
    state.mode = mode;
    el.tabs.forEach(tab => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    Object.entries(el.panels).forEach(([name, panel]) => panel.classList.toggle("hidden", name !== mode));
    if (mode === "play") requestAnimationFrame(drawBalanceChart);
  }

  function resetPlay() {
    if (state.play.round && state.play.round.animating) return;
    state.play = emptyPlay();
    localStorage.removeItem(STORAGE_KEY);
    renderPlay();
  }

  el.tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  el.playDeal.addEventListener("click", startPlayHand);
  el.resetPlay.addEventListener("click", resetPlay);
  window.addEventListener("resize", () => requestAnimationFrame(drawBalanceChart));
  window.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (state.mode !== "play") return;
    const key = event.key.toUpperCase();
    const shortcuts = { C: "check", "3": "raise3", "4": "raise4", "2": "raise2", F: "fold", "1": "call1" };
    if (shortcuts[key]) {
      event.preventDefault();
      takeAction(shortcuts[key]);
      return;
    }
    if (event.key === "Enter" && !el.playDeal.disabled) {
      event.preventDefault();
      startPlayHand();
    }
  });

  renderPlay();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
})();
