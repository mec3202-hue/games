// Run with:  node --test golf/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');

require('../js/cards.js');
require('../js/rules.js');
require('../js/bots.js');
const Golf = globalThis.Golf;

// Build a grid from a list like ['5', 'K', 'JOKER', ...]. All face up.
function gridOf(ranks) {
  return ranks.map(function (rank) {
    return { card: { rank: rank, suit: '♠' }, faceUp: true, cleared: false };
  });
}

test('card values', function () {
  const value = function (rank) { return Golf.cardValue({ rank: rank }); };
  assert.strictEqual(value('A'), 1);
  assert.strictEqual(value('7'), 7);
  assert.strictEqual(value('10'), 10);
  assert.strictEqual(value('J'), 10);
  assert.strictEqual(value('Q'), 10);
  assert.strictEqual(value('K'), 0);
  assert.strictEqual(value('JOKER'), -4);
});

test('deck has 54 cards including 2 jokers', function () {
  const deck = Golf.makeDeck();
  assert.strictEqual(deck.length, 54);
  assert.strictEqual(deck.filter(function (c) { return c.rank === 'JOKER'; }).length, 2);
});

test('finds a matching row or column, preferring the most valuable', function () {
  const grid = gridOf(['5', '5', '5',
                       '9', 'A', 'A',
                       '9', '2', '3']);
  assert.deepStrictEqual(Golf.findClearableLine(grid), [0, 1, 2]);

  const two = gridOf(['5', '5', '5',
                      'Q', 'A', 'A',
                      'Q', 'A', 'A']);
  two[0].card.rank = 'Q'; // column 0 is now Q Q Q (30 points) — better than 5 5 5
  two[1].card.rank = '5';
  assert.deepStrictEqual(Golf.findClearableLine(two), [0, 3, 6]);
});

test('kings are never cleared and face-down cards do not count', function () {
  assert.strictEqual(Golf.findClearableLine(gridOf(['K', 'K', 'K', '1', '2', '3', '4', '5', '6'])), null);
  const grid = gridOf(['7', '7', '7', '1', '2', '3', '4', '5', '6']);
  grid[2].faceUp = false;
  assert.strictEqual(Golf.findClearableLine(grid), null);
});

test('scoring ignores cleared cards', function () {
  const grid = gridOf(['8', '8', '8', 'K', 'JOKER', 'A', 'Q', '2', '3']);
  for (const i of [0, 1, 2]) grid[i].cleared = true;
  assert.strictEqual(Golf.gridScore(grid), 0 - 4 + 1 + 10 + 2 + 3);
});

test('a player can only clear one line per hole', function () {
  const game = Golf.createGame([Golf.createPlayer('A'), Golf.createPlayer('B')], 0);
  Golf.startHole(game);
  const a = game.players[0];
  a.grid = gridOf(['9', '9', '9', '6', '6', '4', '2', '3', '5']);
  a.grid[5].faceUp = false; // spot 5 will get the third 6
  a.grid[8].faceUp = false; // keep a card face down so the hole continues
  game.discardPile.push({ rank: '9', suit: '♥' });

  // Take a card and place it anywhere — the 9-9-9 row gets cleared.
  Golf.takeDiscard(game);
  game.held = { rank: '6', suit: '♥' };
  Golf.replaceCard(game, 5);
  assert.ok(a.hasCleared);
  assert.ok(a.grid[0].cleared && a.grid[1].cleared && a.grid[2].cleared);
  assert.ok(!a.grid[3].cleared, 'the 6-6-6 row should not also be cleared');
});

test('the hole ends when someone has everything face up, and the loser starts next', function () {
  const game = Golf.createGame([Golf.createPlayer('A'), Golf.createPlayer('B')], 0);
  Golf.startHole(game);
  const [a, b] = game.players;
  a.grid = gridOf(['A', '2', '3', '4', '5', '6', '7', '8', 'K']);
  a.grid[8].faceUp = false;
  b.grid = gridOf(['Q', 'Q', 'J', 'J', '10', '10', '9', '9', '8']);
  b.grid.forEach(function (s) { s.faceUp = false; });

  Golf.drawFromDeck(game);
  Golf.discardHeld(game);
  Golf.flipCard(game, 8);

  assert.strictEqual(game.phase, 'holeOver');
  assert.deepStrictEqual(a.scores, [36]);
  assert.deepStrictEqual(b.scores, [86]);
  assert.ok(b.grid.every(function (s) { return s.faceUp; }));
  assert.strictEqual(game.startingPlayer, 1); // B lost, so B goes first
});

test('the draw pile is rebuilt from the discard pile when it runs out', function () {
  const game = Golf.createGame([Golf.createPlayer('A'), Golf.createPlayer('B')], 0);
  Golf.startHole(game);
  const top = { rank: '4', suit: '♦' };
  game.discardPile = game.drawPile.concat([top]);
  game.drawPile = [];
  Golf.drawFromDeck(game);
  assert.strictEqual(Golf.topDiscard(game), top);
  assert.ok(game.held);
});

// Let bots play complete games against each other.
function playFullGame(difficulties) {
  const players = difficulties.map(function (d, i) { return Golf.createPlayer('Bot' + i, true, d); });
  const game = Golf.createGame(players, 0);
  let turns = 0;
  while (game.phase !== 'gameOver') {
    if (game.phase === 'holeOver') Golf.startHole(game);
    const bot = Golf.currentPlayer(game);
    if (Golf.botChooseSource(game, bot) === 'discard') Golf.takeDiscard(game);
    else Golf.drawFromDeck(game);
    const move = Golf.botChooseMove(game, bot);
    if (move.type === 'flip') {
      Golf.discardHeld(game);
      Golf.flipCard(game, move.index);
    } else {
      Golf.replaceCard(game, move.index);
    }
    if (++turns > 5000) throw new Error('Game did not finish');
  }
  return players.map(Golf.totalScore);
}

test('bots can play full 2- and 3-player games', function () {
  for (let i = 0; i < 20; i++) {
    assert.strictEqual(playFullGame(['smart', 'easy']).length, 2);
    assert.strictEqual(playFullGame(['smart', 'easy', 'smart']).length, 3);
  }
});

test('the smart bot usually beats the easy bot', function () {
  let smartWins = 0;
  const games = 200;
  for (let i = 0; i < games; i++) {
    const [smart, easy] = playFullGame(['smart', 'easy']);
    if (smart < easy) smartWins++;
  }
  assert.ok(smartWins > games * 0.6, 'smart won only ' + smartWins + ' of ' + games);
});
