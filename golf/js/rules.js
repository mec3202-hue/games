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

Golf.HOLES = 9;

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
    hasCleared: false, // each player may clear one line per hole
    scores: [],        // score for each hole played so far
  };
};

Golf.createGame = function (players, firstPlayerIndex, random) {
  return {
    players: players,
    random: random || Math.random,
    hole: 0,
    startingPlayer: firstPlayerIndex, // who starts the next hole
    current: firstPlayerIndex,        // whose turn it is
    drawPile: [],
    discardPile: [],
    // phase is one of:
    //   'turn'     – current player must draw from the deck or take the discard
    //   'holding'  – current player is holding a card and must decide what to do
    //   'flip'     – current player discarded the drawn card and must flip a card
    //   'holeOver' – the hole is finished, waiting to start the next one
    //   'gameOver' – all 9 holes are done
    phase: 'holeOver',
    held: null,     // the card in the current player's hand
    heldFrom: null, // 'deck' or 'discard'
    roundEnder: null,
    log: [],
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

Golf.totalScore = function (player) {
  return player.scores.reduce(function (sum, s) { return sum + s; }, 0);
};

// Find a row or column of three face-up cards with the same rank.
// Returns the line (array of 3 positions) or null. If several lines match,
// the one worth the most points is picked. Kings (0) and Jokers (-4) are
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

// If the player has three of a kind in a line (and hasn't cleared yet this
// hole), clear it.
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

// ---------- starting and finishing a hole ----------

Golf.startHole = function (game) {
  if (game.phase !== 'holeOver') throw new Error('The current hole is not finished');
  game.hole += 1;
  const deck = Golf.shuffle(Golf.makeDeck(), game.random);

  for (const player of game.players) {
    player.grid = [];
    for (let i = 0; i < 9; i++) {
      player.grid.push({ card: deck.pop(), faceUp: false, cleared: false });
    }
    player.hasCleared = false;
  }

  game.discardPile = [deck.pop()];
  game.drawPile = deck;
  game.current = game.startingPlayer;
  game.held = null;
  game.heldFrom = null;
  game.roundEnder = null;
  game.phase = 'turn';
  log(game, '— Hole ' + game.hole + ' — first up: ' + Golf.currentPlayer(game).name);
};

function finishHole(game) {
  const ender = Golf.currentPlayer(game);
  game.roundEnder = game.current;
  log(game, ender.name + ' has all cards face up — the hole is over!');

  // Everyone else flips their remaining cards.
  for (const player of game.players) {
    for (const slot of player.grid) slot.faceUp = true;
    tryClear(game, player);
  }

  // Record scores. Whoever scored the most (the "loser") starts next hole.
  let worst = -Infinity;
  game.players.forEach(function (player, i) {
    const score = Golf.gridScore(player.grid, false);
    player.scores.push(score);
    if (score > worst) {
      worst = score;
      game.startingPlayer = i;
    }
  });

  game.held = null;
  game.heldFrom = null;
  game.phase = game.hole >= Golf.HOLES ? 'gameOver' : 'holeOver';
}

function endTurn(game) {
  const player = Golf.currentPlayer(game);
  tryClear(game, player);
  if (Golf.allRevealed(player.grid)) {
    finishHole(game);
  } else {
    game.current = (game.current + 1) % game.players.length;
    game.phase = 'turn';
  }
}

// ---------- the actions a player can take ----------

// Option A, part 1: draw the top card of the draw pile.
Golf.drawFromDeck = function (game) {
  requirePhase(game, 'turn');
  refillDrawPile(game);
  game.held = game.drawPile.pop();
  game.heldFrom = 'deck';
  game.phase = 'holding';
};

// Option B, part 1: take the top card of the discard pile.
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
  if (game.heldFrom !== 'discard') throw new Error('You drew that card from the deck');
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

// Option A, part 2: throw away the card you drew from the deck...
Golf.discardHeld = function (game) {
  requirePhase(game, 'holding');
  if (game.heldFrom !== 'deck') throw new Error('A card taken from the discard pile must be placed');
  const player = Golf.currentPlayer(game);
  game.discardPile.push(game.held);
  log(game, player.name + ' drew ' + Golf.cardLabel(game.held) + ' and threw it away.');
  game.held = null;
  game.heldFrom = null;
  game.phase = 'flip';
};

// ...and then flip one of your face-down cards.
Golf.flipCard = function (game, index) {
  requirePhase(game, 'flip');
  const player = Golf.currentPlayer(game);
  const slot = player.grid[index];
  if (!slot || slot.faceUp || slot.cleared) throw new Error('Pick a face-down card to flip');
  slot.faceUp = true;
  log(game, player.name + ' flipped over ' + Golf.cardLabel(slot.card) + '.');
  endTurn(game);
};

// The player(s) with the lowest total after all holes.
Golf.winners = function (game) {
  const best = Math.min.apply(null, game.players.map(Golf.totalScore));
  return game.players.filter(function (p) { return Golf.totalScore(p) === best; });
};
