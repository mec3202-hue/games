// bots.js — the computer players.
//
// Before play, a bot picks two cards to flip (chooseReveal). After that,
// a bot's turn has two decisions, just like yours:
//   1. chooseSource: take the discard, or draw from the deck?
//   2. chooseMove:   which card in the grid to swap the new card with?
//
// There are two personalities:
//   • Easy  – follows a few simple rules of thumb, with some randomness.
//   • Smart – "imagines" every possible move, estimates the score it would
//             end up with, and picks the best one. It also tries not to end
//             the game when it's behind.
var Golf = globalThis.Golf || (globalThis.Golf = {});

// The average value of a card in the deck: (4 suits × 71 points − 8 for the
// two Jokers) / 54 cards ≈ 5.1. Bots use this as a guess for face-down cards.
Golf.UNKNOWN_CARD_VALUE = (4 * 71 - 8) / 54;

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- Easy bot ----------

// Index of the face-up (not cleared) card worth the most points, or -1.
function highestFaceUp(grid) {
  let best = -1;
  grid.forEach(function (slot, i) {
    if (!slot.faceUp || slot.cleared) return;
    if (best === -1 || Golf.cardValue(slot.card) > Golf.cardValue(grid[best].card)) best = i;
  });
  return best;
}

function easyChooseSource(game) {
  const top = Golf.topDiscard(game);
  return top && Golf.cardValue(top) <= 2 ? 'discard' : 'deck';
}

function easyChooseMove(game, player, card) {
  const high = highestFaceUp(player.grid);
  // Swap out a known card if this one is lower...
  if (high !== -1 && Golf.cardValue(player.grid[high].card) > Golf.cardValue(card)) {
    return { type: 'replace', index: high };
  }
  // ...otherwise put it on top of a random face-down card.
  return { type: 'replace', index: pickRandom(Golf.faceDownIndexes(player.grid)) };
}

// ---------- Smart bot ----------

function copyGrid(grid) {
  return grid.map(function (slot) {
    return { card: slot.card, faceUp: slot.faceUp, cleared: slot.cleared };
  });
}

// Guess the score a player will end up with for this grid.
// Face-down cards count as the average card. Two matching cards in a line
// get a small discount, because a third match would clear them.
function estimateScore(grid, hasCleared) {
  grid = copyGrid(grid);
  if (!hasCleared) {
    const line = Golf.findClearableLine(grid);
    if (line) {
      for (const i of line) grid[i].cleared = true;
      hasCleared = true;
    }
  }

  let total = 0;
  for (const slot of grid) {
    if (slot.cleared) continue;
    total += slot.faceUp ? Golf.cardValue(slot.card) : Golf.UNKNOWN_CARD_VALUE;
  }

  if (!hasCleared) {
    for (const line of Golf.LINES) {
      const up = line.map(function (i) { return grid[i]; }).filter(function (s) { return s.faceUp; });
      for (let a = 0; a < up.length; a++) {
        for (let b = a + 1; b < up.length; b++) {
          const value = Golf.cardValue(up[a].card);
          if (up[a].card.rank === up[b].card.rank && value > 0) total -= value * 0.3;
        }
      }
    }
  }
  return total;
}

// If a move ends the game, adjust its rating: good if we're (probably)
// winning, very bad if we're not.
function endOfHoleAdjustment(game, player, score) {
  const opponents = game.players.filter(function (p) { return p !== player; });
  const bestOpponent = Math.min.apply(null, opponents.map(function (p) {
    return estimateScore(p.grid, p.hasCleared);
  }));
  return score < bestOpponent ? -2 : 15;
}

// Score a possible grid for the bot. Lower is better.
function rateGrid(game, player, grid) {
  const score = estimateScore(grid, player.hasCleared);
  return Golf.allRevealed(grid) ? score + endOfHoleAdjustment(game, player, score) : score;
}

// All the moves the bot could make with `card`, best first.
function smartOptions(game, player, card) {
  const options = [];
  player.grid.forEach(function (slot, i) {
    if (slot.cleared) return;
    const grid = copyGrid(player.grid);
    grid[i] = { card: card, faceUp: true, cleared: false };
    options.push({ type: 'replace', index: i, rating: rateGrid(game, player, grid) });
  });
  options.sort(function (a, b) { return a.rating - b.rating; });
  return options;
}

function smartChooseMove(game, player, card) {
  return smartOptions(game, player, card)[0];
}

function smartChooseSource(game, player) {
  const top = Golf.topDiscard(game);
  if (!top) return 'deck';
  const now = estimateScore(player.grid, player.hasCleared);
  const best = smartOptions(game, player, top)[0];
  // Take the discard only if it clearly helps; otherwise gamble on the deck.
  return now - best.rating >= 2.5 ? 'discard' : 'deck';
}

// ---------- what ui.js calls ----------

Golf.botChooseSource = function (game, player) {
  return player.difficulty === 'easy'
    ? easyChooseSource(game, player)
    : smartChooseSource(game, player);
};

Golf.botChooseMove = function (game, player) {
  return player.difficulty === 'easy'
    ? easyChooseMove(game, player, game.held)
    : smartChooseMove(game, player, game.held);
};

// Which card to flip at the start of the game. Nothing is known yet, so any
// face-down card will do.
Golf.botChooseReveal = function (game, player) {
  return pickRandom(Golf.faceDownIndexes(player.grid));
};

Golf.estimateScore = estimateScore;
