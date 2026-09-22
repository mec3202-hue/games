// cards.js — everything about a single card and a deck of cards.
//
// Every file in this game adds its functions to one shared object called
// `Golf`. That way the browser (which loads the files with <script> tags)
// and Node.js (which runs the tests) can both use the same code.
var Golf = globalThis.Golf || (globalThis.Golf = {});

Golf.SUITS = ['♠', '♥', '♦', '♣'];
Golf.RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// How many points a card is worth. Low is good!
Golf.cardValue = function (card) {
  switch (card.rank) {
    case 'A': return 1;
    case 'J':
    case 'Q': return 10;
    case 'K': return 0;
    case 'JOKER': return -4;
    default: return Number(card.rank); // '2'..'10'
  }
};

// A human-friendly name for a card, e.g. "7♥" or "Joker".
Golf.cardLabel = function (card) {
  return card.rank === 'JOKER' ? 'Joker' : card.rank + card.suit;
};

Golf.isRed = function (card) {
  return card.suit === '♥' || card.suit === '♦';
};

// Build a fresh 54-card deck: 52 regular cards plus two Jokers.
Golf.makeDeck = function () {
  const deck = [];
  let id = 0;
  for (const suit of Golf.SUITS) {
    for (const rank of Golf.RANKS) {
      deck.push({ id: id++, rank: rank, suit: suit });
    }
  }
  deck.push({ id: id++, rank: 'JOKER', suit: '★' });
  deck.push({ id: id++, rank: 'JOKER', suit: '☆' });
  return deck;
};

// Shuffle an array in place using the Fisher–Yates algorithm.
// `random` can be swapped out (e.g. in tests) to get a predictable order.
Golf.shuffle = function (cards, random) {
  random = random || Math.random;
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = cards[i];
    cards[i] = cards[j];
    cards[j] = temp;
  }
  return cards;
};
