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

  $('start-button').addEventListener('click', function () {
    const players = [Golf.createPlayer($('player-name').value.trim() || 'You', false)];
    const difficulties = [$('bot1-difficulty').value, $('bot2-difficulty').value];
    for (let i = 0; i < botCount(); i++) {
      players.push(Golf.createPlayer(BOT_NAMES[i], true, difficulties[i]));
    }
    const first = $('first-player').value === 'human'
      ? 0
      : Math.floor(Math.random() * players.length);

    game = Golf.createGame(players, first);
    Golf.startHole(game);
    $('setup').hidden = true;
    $('table').hidden = false;
    render();
  });

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

  // Can the human click this grid position right now?
  function canClickSlot(slot) {
    if (!isHumanTurn() || slot.cleared) return false;
    if (game.phase === 'holding') return true;
    if (game.phase === 'flip') return !slot.faceUp;
    return false;
  }

  function isHumanTurn() {
    return game && !Golf.currentPlayer(game).isBot &&
      (game.phase === 'turn' || game.phase === 'holding' || game.phase === 'flip');
  }

  function playerElement(player, index) {
    const isMe = !player.isBot;
    const box = document.createElement('div');
    box.className = 'player' + (isMe ? ' me' : '');
    if (index === game.current && (game.phase === 'turn' || game.phase === 'holding' || game.phase === 'flip')) {
      box.classList.add('active');
    }

    const header = document.createElement('div');
    header.className = 'player-header';
    const tag = player.isBot ? ' <small>(' + (player.difficulty === 'easy' ? 'Easy' : 'Smart') + ' bot)</small>' : '';
    const showing = Golf.gridScore(player.grid, true);
    header.innerHTML = '<b>' + escapeHtml(player.name) + '</b>' + tag +
      '<span class="showing">showing ' + showing + '</span>';
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
      (player.isBot ? $('opponents') : $('me')).appendChild(el);
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
      (game.phase === 'turn' && top || game.phase === 'holding');
    if (discardClickable) discardEl.classList.add('clickable');
    discardEl.addEventListener('click', onDiscardClick);
    $('discard-pile').replaceWith(discardEl);

    // Card in hand
    const heldEl = game.held ? cardElement(game.held) : emptyElement();
    heldEl.id = 'held-card';
    $('held-card').replaceWith(heldEl);
    $('held-label').textContent = game.held
      ? Golf.currentPlayer(game).name + (Golf.currentPlayer(game).isBot ? ' holds' : ' hold')
      : 'In hand';

    $('status').textContent = statusText();
    renderHoleOver();
    renderScorecard();
    renderLog();
    scheduleBot();
  }

  function statusText() {
    const player = Golf.currentPlayer(game);
    if (game.phase === 'holeOver' || game.phase === 'gameOver') return '';
    if (player.isBot) return player.name + ' is thinking…';

    const top = Golf.topDiscard(game);
    switch (game.phase) {
      case 'turn':
        return top
          ? 'Your turn! Draw from the deck, or take the ' + Golf.cardLabel(top) + ' from the discard pile.'
          : 'Your turn! Draw from the deck.';
      case 'holding':
        return game.heldFrom === 'deck'
          ? 'You drew ' + Golf.cardLabel(game.held) + '. Click one of your cards to swap it in, or click the discard pile to throw it away.'
          : 'Click one of your cards to swap in the ' + Golf.cardLabel(game.held) + '. (Click the discard pile to put it back.)';
      case 'flip':
        return 'Now click one of your face-down cards to flip it over.';
    }
    return '';
  }

  function renderHoleOver() {
    const box = $('hole-over');
    if (game.phase !== 'holeOver' && game.phase !== 'gameOver') {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;

    const ender = game.players[game.roundEnder];
    let html = '<h2>Hole ' + game.hole + ' finished</h2><p>' + escapeHtml(ender.name) +
      ' went out.</p><ul>';
    game.players.forEach(function (p) {
      html += '<li>' + escapeHtml(p.name) + ': <b>' + p.scores[p.scores.length - 1] +
        '</b> this hole, ' + Golf.totalScore(p) + ' total</li>';
    });
    html += '</ul>';

    if (game.phase === 'gameOver') {
      const winners = Golf.winners(game);
      const names = winners.map(function (p) { return escapeHtml(p.name); }).join(' and ');
      html += '<h2 class="winner">🏆 ' + names + (winners.length > 1 ? ' tie!' : ' wins!') + '</h2>';
      html += '<button id="next-button" class="primary">Play again</button>';
    } else {
      const next = game.players[game.startingPlayer];
      html += '<p>' + escapeHtml(next.name) + ' had the highest score, so tees off next.</p>';
      html += '<button id="next-button" class="primary">Tee off hole ' + (game.hole + 1) + '</button>';
    }
    box.innerHTML = html;

    $('next-button').addEventListener('click', function () {
      if (game.phase === 'gameOver') {
        $('quit-button').click();
      } else {
        Golf.startHole(game);
        render();
      }
    });
  }

  function renderScorecard() {
    let html = '<tr><th></th>';
    for (let h = 1; h <= Golf.HOLES; h++) {
      html += '<th' + (h === game.hole ? ' class="current"' : '') + '>' + h + '</th>';
    }
    html += '<th>Total</th></tr>';
    game.players.forEach(function (p) {
      html += '<tr><th>' + escapeHtml(p.name) + '</th>';
      for (let h = 0; h < Golf.HOLES; h++) {
        html += '<td>' + (h < p.scores.length ? p.scores[h] : '') + '</td>';
      }
      html += '<td class="total">' + Golf.totalScore(p) + '</td></tr>';
    });
    $('scorecard').innerHTML = html;
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
    } else if (game.phase === 'holding') {
      act(function () {
        if (game.heldFrom === 'deck') Golf.discardHeld(game);
        else Golf.returnDiscard(game);
      });
    }
  }

  function onSlotClick(index) {
    if (game.phase === 'holding') act(function () { Golf.replaceCard(game, index); });
    else if (game.phase === 'flip') act(function () { Golf.flipCard(game, index); });
  }

  // ---------- bot turns ----------

  function scheduleBot() {
    if (botTimer || !game || game.phase !== 'turn') return;
    const bot = Golf.currentPlayer(game);
    if (!bot.isBot) return;

    // Step 1: pick up a card.
    botTimer = setTimeout(function () {
      if (Golf.botChooseSource(game, bot) === 'discard') Golf.takeDiscard(game);
      else Golf.drawFromDeck(game);
      render();

      // Step 2: decide what to do with it.
      botTimer = setTimeout(function () {
        const move = Golf.botChooseMove(game, bot);
        if (move.type === 'flip') {
          Golf.discardHeld(game);
          Golf.flipCard(game, move.index);
        } else {
          Golf.replaceCard(game, move.index);
        }
        botTimer = null;
        render(); // this schedules the next bot, if it's a bot's turn
      }, BOT_DELAY);
    }, BOT_DELAY);
  }
})();
