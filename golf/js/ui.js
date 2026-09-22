// ui.js — draws the game on the screen and handles clicks.
//
// The approach is simple: whenever anything changes, call render(), which
// rebuilds the table from the `game` object. That way the screen can never
// get "out of sync" with the rules.
var Golf = globalThis.Golf || (globalThis.Golf = {});

(function () {
  // Milliseconds between bot actions, so you can follow along.
  // Open index.html?fast to make the bots play quickly (useful while testing).
  const BOT_DELAY = location.search.includes('fast') ? 30 : 900;
  const BOT_NAMES = ['Birdie', 'Bogey'];
  const HUMAN = 0; // the human is always player 0

  let game = null;
  let botTimer = null;

  const $ = function (id) { return document.getElementById(id); };

  // ---------- setup screen ----------

  function botCount() {
    return Number(document.querySelector('input[name="bot-count"]:checked').value);
  }

  document.querySelectorAll('input[name="bot-count"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      $('bot2-row').hidden = botCount() < 2;
    });
  });

  // Start a game using whatever is chosen on the setup screen.
  function startGame() {
    const players = [Golf.createPlayer($('player-name').value.trim() || 'You', false)];
    const difficulties = [$('bot1-difficulty').value, $('bot2-difficulty').value];
    for (let i = 0; i < botCount(); i++) {
      players.push(Golf.createPlayer(BOT_NAMES[i], true, difficulties[i]));
    }
    const first = $('first-player').value === 'human'
      ? HUMAN
      : Math.floor(Math.random() * players.length);

    clearTimeout(botTimer);
    botTimer = null;
    game = Golf.createGame(players, first);

    // The bots flip their two starting cards right away; then it's your pick.
    game.players.forEach(function (player, i) {
      while (player.isBot && Golf.needsToReveal(game, i)) {
        Golf.revealStartingCard(game, i, Golf.botChooseReveal(game, player));
      }
    });

    $('setup').hidden = true;
    $('table').hidden = false;
    render();
  }

  $('start-button').addEventListener('click', startGame);

  $('quit-button').addEventListener('click', function () {
    clearTimeout(botTimer);
    botTimer = null;
    game = null;
    $('table').hidden = true;
    $('setup').hidden = false;
  });

  // ---------- drawing cards ----------

  function cardElement(card) {
    const el = document.createElement('div');
    el.className = 'card face';
    if (card.rank === 'JOKER') {
      el.classList.add('joker');
      el.innerHTML = '<span class="rank">🃏</span><span class="suit">Joker</span>';
    } else {
      if (Golf.isRed(card)) el.classList.add('red');
      el.innerHTML = '<span class="rank">' + card.rank + '</span><span class="suit">' + card.suit + '</span>';
    }
    el.title = Golf.cardLabel(card) + ' (' + Golf.cardValue(card) + ' pts)';
    return el;
  }

  function slotElement(slot) {
    if (slot.cleared) {
      const el = cardElement(slot.card);
      el.classList.add('cleared');
      el.title = 'Cleared';
      return el;
    }
    if (!slot.faceUp) {
      const el = document.createElement('div');
      el.className = 'card back';
      return el;
    }
    return cardElement(slot.card);
  }

  function emptyElement() {
    const el = document.createElement('div');
    el.className = 'card empty';
    return el;
  }

  function isHumanTurn() {
    return game && game.current === HUMAN &&
      (game.phase === 'turn' || game.phase === 'holding');
  }

  // Can the human click this grid position right now?
  function canClickSlot(slot) {
    if (slot.cleared) return false;
    if (Golf.needsToReveal(game, HUMAN)) return !slot.faceUp;
    return isHumanTurn() && game.phase === 'holding';
  }

  function playerElement(player, index) {
    const isMe = index === HUMAN;
    const box = document.createElement('div');
    box.className = 'player' + (isMe ? ' me' : '');
    if (index === game.current && (game.phase === 'turn' || game.phase === 'holding')) {
      box.classList.add('active');
    }

    const header = document.createElement('div');
    header.className = 'player-header';
    const tag = player.isBot ? ' <small>(' + (player.difficulty === 'easy' ? 'Easy' : 'Smart') + ' bot)</small>' : '';
    const points = game.phase === 'gameOver'
      ? player.score + ' points'
      : 'showing ' + Golf.gridScore(player.grid, true);
    header.innerHTML = '<b>' + escapeHtml(player.name) + '</b>' + tag +
      '<span class="showing">' + points + '</span>';
    box.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid';
    player.grid.forEach(function (slot, i) {
      const el = slotElement(slot);
      if (isMe && canClickSlot(slot)) {
        el.classList.add('clickable');
        el.addEventListener('click', function () { onSlotClick(i); });
      }
      grid.appendChild(el);
    });
    box.appendChild(grid);
    return box;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---------- render everything ----------

  function render() {
    if (!game) return;

    // Players
    $('opponents').innerHTML = '';
    $('me').innerHTML = '';
    game.players.forEach(function (player, i) {
      const el = playerElement(player, i);
      (i === HUMAN ? $('me') : $('opponents')).appendChild(el);
    });

    // Deck
    const deckClickable = isHumanTurn() && game.phase === 'turn';
    $('draw-pile').classList.toggle('clickable', deckClickable);
    $('draw-pile').classList.toggle('empty-deck', game.drawPile.length === 0);
    $('deck-count').textContent = '(' + game.drawPile.length + ')';

    // Discard pile
    const top = Golf.topDiscard(game);
    const discardEl = top ? cardElement(top) : emptyElement();
    discardEl.id = 'discard-pile';
    const discardClickable = isHumanTurn() &&
      (game.phase === 'turn' && top || game.phase === 'holding' && game.heldFrom === 'discard');
    if (discardClickable) discardEl.classList.add('clickable');
    discardEl.addEventListener('click', onDiscardClick);
    $('discard-pile').replaceWith(discardEl);

    // Card in hand
    const heldEl = game.held ? cardElement(game.held) : emptyElement();
    heldEl.id = 'held-card';
    $('held-card').replaceWith(heldEl);
    $('held-label').textContent = game.held
      ? Golf.currentPlayer(game).name + (game.current === HUMAN ? ' hold' : ' holds')
      : 'In hand';

    $('status').textContent = statusText();
    renderGameOver();
    renderLog();
    scheduleBot();
  }

  function statusText() {
    if (game.phase === 'gameOver') return '';
    if (game.phase === 'reveal') {
      const left = Golf.STARTING_FLIPS - Golf.faceUpCount(game.players[HUMAN].grid);
      return 'Flip ' + left + ' of your cards to start.';
    }

    const player = Golf.currentPlayer(game);
    if (player.isBot) return player.name + ' is thinking…';

    const top = Golf.topDiscard(game);
    if (game.phase === 'turn') {
      return top
        ? 'Your turn! Draw from the deck, or take the ' + Golf.cardLabel(top) + ' from the discard pile.'
        : 'Your turn! Draw from the deck.';
    }
    // phase is 'holding'
    return game.heldFrom === 'deck'
      ? 'You drew ' + Golf.cardLabel(game.held) + '. Click one of your cards to swap it in.'
      : 'Click one of your cards to swap in the ' + Golf.cardLabel(game.held) + '. (Click the discard pile to put it back.)';
  }

  function renderGameOver() {
    const box = $('game-over');
    if (game.phase !== 'gameOver') {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;

    const ranked = game.players.slice().sort(function (a, b) { return a.score - b.score; });
    const winners = Golf.winners(game);
    const names = winners.map(function (p) { return escapeHtml(p.name); }).join(' and ');

    let html = '<h2 class="winner">🏆 ' + names + (winners.length > 1 ? ' tie!' : ' wins!') + '</h2>';
    html += '<p>' + escapeHtml(game.players[game.wentOut].name) + ' went out.</p><ol>';
    ranked.forEach(function (p) {
      html += '<li>' + escapeHtml(p.name) + ': <b>' + p.score + '</b> points</li>';
    });
    html += '</ol><button id="again-button" class="primary">Play again</button>';
    box.innerHTML = html;
    $('again-button').addEventListener('click', startGame);
  }

  function renderLog() {
    $('log').innerHTML = game.log.slice(-8).reverse().map(function (line) {
      return '<li>' + escapeHtml(line) + '</li>';
    }).join('');
  }

  // ---------- human clicks ----------

  function act(action) {
    try {
      action();
    } catch (err) {
      $('status').textContent = err.message;
      return;
    }
    render();
  }

  $('draw-pile').addEventListener('click', function () {
    if (isHumanTurn() && game.phase === 'turn') act(function () { Golf.drawFromDeck(game); });
  });

  function onDiscardClick() {
    if (!isHumanTurn()) return;
    if (game.phase === 'turn') {
      act(function () { Golf.takeDiscard(game); });
    } else if (game.heldFrom === 'discard') {
      act(function () { Golf.returnDiscard(game); });
    }
  }

  function onSlotClick(index) {
    if (game.phase === 'reveal') act(function () { Golf.revealStartingCard(game, HUMAN, index); });
    else if (game.phase === 'holding') act(function () { Golf.replaceCard(game, index); });
  }

  // ---------- bot turns ----------

  function scheduleBot() {
    if (botTimer || !game) return;
    const bot = Golf.currentPlayer(game);
    if (!bot.isBot || (game.phase !== 'turn' && game.phase !== 'holding')) return;

    // Step 2: swap the card in hand into the grid.
    function playHeldCard() {
      Golf.replaceCard(game, Golf.botChooseMove(game, bot).index);
      botTimer = null;
      render(); // this schedules the next bot, if it's a bot's turn
    }

    // Step 1: pick up a card (skipped on the opening turn, which is drawn for you).
    botTimer = setTimeout(function () {
      if (game.phase === 'holding') return playHeldCard();
      if (Golf.botChooseSource(game, bot) === 'discard') Golf.takeDiscard(game);
      else Golf.drawFromDeck(game);
      render();
      botTimer = setTimeout(playHeldCard, BOT_DELAY);
    }, BOT_DELAY);
  }
})();
