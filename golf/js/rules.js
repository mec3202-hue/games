// rules.js — the rules of 9 Card Golf. This file knows nothing about the
// screen; it only changes the `game` object. The UI (ui.js) reads that
// object to draw the table, and the bots (bots.js) read it to make choices.
//
// Grid positions are numbered like this:
//
//     0 1 2
//     3 4 5
//     6 7 8
var Golf = globalThis.Golf || (globalThis.Golf = {});

// How many cards each player flips face up before play starts.
Golf.STARTING_FLIPS = 2;

// The 3 rows and 3 columns that can be cleared with three matching cards.
Golf.LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
];

Golf.createPlayer = function (name, isBot, difficulty) {
  return {
    name: name,
    isBot: isBot,
    difficulty: difficulty || null, // 'easy' or 'smart' for bots
    grid: [],          // 9 slots: { card, faceUp, cleared }
    hasCleared: false, // each player may clear one line per game
    score: null,       // filled in when the game ends
  };
};

// ---------- small helpers ----------

Golf.currentPlayer = function (game) {
  return game.players[game.current];
};

Golf.topDiscard = function (game) {
  return game.discardPile[game.discardPile.length - 1] || null;
};

// True when every card in the grid is face up (or cleared away).
Golf.allRevealed = function (grid) {
  return grid.every(function (slot) { return slot.faceUp || slot.cleared; });
};

Golf.faceDownIndexes = function (grid) {
  const result = [];
  grid.forEach(function (slot, i) {
    if (!slot.faceUp && !slot.cleared) result.push(i);
  });
  return result;
};

Golf.faceUpCount = function (grid) {
  return grid.filter(function (slot) { return slot.faceUp; }).length;
};

// Points for a player's grid. Cleared cards count as zero.
// With onlyFaceUp = true, face-down cards are ignored (what everyone can see).
Golf.gridScore = function (grid, onlyFaceUp) {
  let total = 0;
  for (const slot of grid) {
    if (slot.cleared) continue;
    if (onlyFaceUp && !slot.faceUp) continue;
    total += Golf.cardValue(slot.card);
  }
  return total;
};

// Find a row or column of three face-up cards with the same rank.
// Returns the line (array of 3 positions) or null. If several lines match,
// the one worth the most points is picked. Kings (0), 2s (-2) and Jokers (-4) are
// never cleared, because clearing them would make your score worse or
// waste your one clear.
Golf.findClearableLine = function (grid) {
  let best = null;
  let bestValue = 0;
  for (const line of Golf.LINES) {
    const slots = line.map(function (i) { return grid[i]; });
    const allUp = slots.every(function (s) { return s.faceUp && !s.cleared; });
    if (!allUp) continue;
    const rank = slots[0].card.rank;
    if (!slots.every(function (s) { return s.card.rank === rank; })) continue;
    const value = Golf.cardValue(slots[0].card) * 3;
    if (value > bestValue) {
      best = line;
      bestValue = value;
    }
  }
  return best;
};

function log(game, message) {
  game.log.push(message);
  if (game.log.length > 50) game.log.shift();
}

// If the player has three of a kind in a line (and hasn't cleared yet), clear it.
function tryClear(game, player) {
  if (player.hasCleared) return;
  const line = Golf.findClearableLine(player.grid);
  if (!line) return;
  for (const i of line) player.grid[i].cleared = true;
  player.hasCleared = true;
  const rank = player.grid[line[0]].card.rank;
  log(game, player.name + ' matched three ' + rank + "'s and cleared them!");
}

// If the draw pile runs out, shuffle the discard pile (except its top card)
// to make a new draw pile.
function refillDrawPile(game) {
  if (game.drawPile.length > 0) return;
  const top = game.discardPile.pop();
  game.drawPile = Golf.shuffle(game.discardPile, game.random);
  game.discardPile = top ? [top] : [];
  log(game, 'The draw pile ran out, so the discard pile was shuffled in.');
}

function requirePhase(game, phase) {
  if (game.phase !== phase) {
    throw new Error('Not allowed right now (phase is ' + game.phase + ', needed ' + phase + ')');
  }
}

// ---------- starting the game ----------

// Shuffle, deal 9 cards face down to everyone, and start the discard pile.
Golf.createGame = function (players, firstPlayerIndex, random) {
  const game = {
    players: players,
    random: random || Math.random,
    current: firstPlayerIndex, // whose turn it is
    drawPile: [],
    discardPile: [],
    // phase is one of:
    //   'reveal'   – everyone is flipping their first two cards
    //   'turn'     – current player must draw from the deck or take the discard
    //   'holding'  – current player is holding a card and must swap it in
    //   'gameOver' – someone went out and the game has been scored
    phase: 'reveal',
    held: null,     // the card in the current player's hand
    heldFrom: null, // 'deck' or 'discard'
    wentOut: null,  // index of the player who went out
    log: [],
  };

  const deck = Golf.shuffle(Golf.makeDeck(), game.random);
  for (const player of players) {
    player.grid = [];
    for (let i = 0; i < 9; i++) {
      player.grid.push({ card: deck.pop(), faceUp: false, cleared: false });
    }
    player.hasCleared = false;
    player.score = null;
  }
  game.discardPile = [deck.pop()];
  game.drawPile = deck;
  log(game, 'Everyone flips ' + Golf.STARTING_FLIPS + ' cards to start.');
  return game;
};

// Does this player still need to flip starting cards?
Golf.needsToReveal = function (game, playerIndex) {
  return game.phase === 'reveal' &&
    Golf.faceUpCount(game.players[playerIndex].grid) < Golf.STARTING_FLIPS;
};

// Before play starts, each player flips two of their own cards.
Golf.revealStartingCard = function (game, playerIndex, index) {
  requirePhase(game, 'reveal');
  const player = game.players[playerIndex];
  const slot = player.grid[index];
  if (!Golf.needsToReveal(game, playerIndex)) throw new Error(player.name + ' already flipped their cards');
  if (!slot || slot.faceUp) throw new Error('Pick a face-down card to flip');
  slot.faceUp = true;
  log(game, player.name + ' flipped over ' + Golf.cardLabel(slot.card) + '.');

  const everyoneDone = game.players.every(function (p, i) { return !Golf.needsToReveal(game, i); });
  if (everyoneDone) {
    // Play begins. The first player's opening card comes straight off the deck.
    game.phase = 'turn';
    log(game, Golf.currentPlayer(game).name + ' goes first and draws from the deck.');
    Golf.drawFromDeck(game);
  }
};

// ---------- ending the game ----------

function finishGame(game) {
  const ender = Golf.currentPlayer(game);
  game.wentOut = game.current;
  log(game, ender.name + ' has all cards face up — game over!');

  // Everyone else flips their remaining cards, then all hands are scored.
  for (const player of game.players) {
    for (const slot of player.grid) slot.faceUp = true;
    tryClear(game, player);
    player.score = Golf.gridScore(player.grid, false);
  }
  game.held = null;
  game.heldFrom = null;
  game.phase = 'gameOver';
}

function endTurn(game) {
  const player = Golf.currentPlayer(game);
  tryClear(game, player);
  if (Golf.allRevealed(player.grid)) {
    finishGame(game);
  } else {
    game.current = (game.current + 1) % game.players.length;
    game.phase = 'turn';
  }
}

// The player(s) with the lowest score.
Golf.winners = function (game) {
  const best = Math.min.apply(null, game.players.map(function (p) { return p.score; }));
  return game.players.filter(function (p) { return p.score === best; });
};

// ---------- the actions a player can take ----------

// Draw the top card of the draw pile. You must then swap it into your grid.
Golf.drawFromDeck = function (game) {
  requirePhase(game, 'turn');
  refillDrawPile(game);
  game.held = game.drawPile.pop();
  game.heldFrom = 'deck';
  game.phase = 'holding';
};

// Take the top card of the discard pile. You must then swap it into your grid.
Golf.takeDiscard = function (game) {
  requirePhase(game, 'turn');
  if (game.discardPile.length === 0) throw new Error('The discard pile is empty');
  game.held = game.discardPile.pop();
  game.heldFrom = 'discard';
  game.phase = 'holding';
};

// Changed your mind? Put the discard back (only before placing it).
Golf.returnDiscard = function (game) {
  requirePhase(game, 'holding');
  if (game.heldFrom !== 'discard') throw new Error('A card drawn from the deck must be played');
  game.discardPile.push(game.held);
  game.held = null;
  game.heldFrom = null;
  game.phase = 'turn';
};

// Put the held card into your grid face up. The old card goes to the discard pile.
Golf.replaceCard = function (game, index) {
  requirePhase(game, 'holding');
  const player = Golf.currentPlayer(game);
  const slot = player.grid[index];
  if (!slot || slot.cleared) throw new Error('That spot has been cleared');

  const oldCard = slot.card;
  slot.card = game.held;
  slot.faceUp = true;
  game.discardPile.push(oldCard);
  log(game, player.name + ' took ' + Golf.cardLabel(game.held) + ' from the ' + game.heldFrom +
    ' and threw away ' + Golf.cardLabel(oldCard) + '.');
  game.held = null;
  game.heldFrom = null;
  endTurn(game);
};
