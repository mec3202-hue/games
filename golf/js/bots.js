// bots.js — the computer players.
//
// A bot's turn has two decisions, just like yours:
//   1. chooseSource: take the discard, or draw from the deck?
//   2. chooseMove:   with the card in hand, which card to replace
//                    (or, if it came from the deck, throw it away and flip)?
//
// There are two personalities:
//   • Easy  – follows a few simple rules of thumb, with some randomness.
//   • Smart – "imagines" every possible move, estimates the score it would
//             end up with, and picks the best one. It also tries not to end
//             the hole when it's behind.
var Golf = globalThis.Golf || (globalThis.Golf = {});

// The average value of a card in the deck: (4 suits × 75 points − 8 for the
// two Jokers) / 54 cards ≈ 5.4. Bots use this as a guess for face-down cards.
Golf.UNKNOWN_CARD_VALUE = (4 * 75 - 8) / 54;

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

function easyChooseMove(game, player, card, canFlip) {
  const value = Golf.cardValue(card);
  const high = highestFaceUp(player.grid);
  const faceDown = Golf.faceDownIndexes(player.grid);

  // Swap out a known high card if this one is lower.
  if (high !== -1 && Golf.cardValue(player.grid[high].card) > value && value <= 6) {
    return { type: 'replace', index: high };
  }
  // A low card goes on top of a random face-down card.
  if ((value <= 6 || !canFlip) && faceDown.length > 0) {
    return { type: 'replace', index: pickRandom(faceDown) };
  }
  if (canFlip) {
    return { type: 'flip', index: pickRandom(faceDown) };
  }
  // Must place a card from the discard pile somewhere.
  return { type: 'replace', index: high };
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

// If a move ends the hole, adjust its rating: good if we're (probably)
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

// All the moves the bot could make with `card`, each with a rating.
function smartOptions(game, player, card, canFlip) {
  const options = [];

  player.grid.forEach(function (slot, i) {
    if (slot.cleared) return;
    const grid = copyGrid(player.grid);
    grid[i] = { card: card, faceUp: true, cleared: false };
    options.push({ type: 'replace', index: i, rating: rateGrid(game, player, grid) });
  });

  if (canFlip) {
    // Flipping an unknown card doesn't change our estimate on average, but it
    // could end the hole if it's our last face-down card.
    const faceDown = Golf.faceDownIndexes(player.grid);
    const index = pickRandom(faceDown);
    let rating = estimateScore(player.grid, player.hasCleared);
    if (faceDown.length === 1) rating += endOfHoleAdjustment(game, player, rating);
    options.push({ type: 'flip', index: index, rating: rating });
  }

  options.sort(function (a, b) { return a.rating - b.rating; });
  return options;
}

function smartChooseMove(game, player, card, canFlip) {
  return smartOptions(game, player, card, canFlip)[0];
}

function smartChooseSource(game, player) {
  const top = Golf.topDiscard(game);
  if (!top) return 'deck';
  const now = estimateScore(player.grid, player.hasCleared);
  const best = smartOptions(game, player, top, false)[0];
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
  const canFlip = game.heldFrom === 'deck';
  return player.difficulty === 'easy'
    ? easyChooseMove(game, player, game.held, canFlip)
    : smartChooseMove(game, player, game.held, canFlip);
};

Golf.estimateScore = estimateScore;
