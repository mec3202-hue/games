# ⛳ 9 Card Golf

A browser version of 9 Card Golf (the variant described below), with one or
two computer opponents.

## Playing

Open `index.html` in any web browser (double-clicking it works). You don't need
to install anything.

On the start screen, pick **1 or 2 bots** and how tough each one is:

- **Easy** – plays by simple rules of thumb and makes plenty of mistakes.
- **Smart** – weighs every possible move and avoids ending the game when it's
  behind. In testing it beats the Easy bot about 7 games out of 10.

## Rules (this variant)

- Each player gets 9 cards **face down** in a 3×3 grid, then flips any **2**
  of them face up.
- The first player's opening card is drawn from the deck for them.
- On your turn, either **draw from the deck** or **take the top discard** —
  then you **must** swap it with one of your cards (face up or face down).
  The swapped-out card goes on the discard pile, face up.
- The game is a single round. The moment someone has all 9 cards face up, the
  game ends: everyone else flips their remaining cards, and the **lowest score
  wins**.

| Card | Points |
| --- | --- |
| Ace | 1 |
| 2–10 | face value |
| Jack, Queen | 10 |
| King | 0 |
| Joker | −4 |

**Three of a kind:** three matching cards in a row or column are cleared and
count as 0. You can only do this once per game. (The game clears lines for you
automatically. Kings are never cleared, because they're already worth 0 and
you'd waste your one clear.)

## How the code is organized

The files are loaded in this order, and each one builds on the ones before it:

| File | What it does |
| --- | --- |
| `js/cards.js` | Cards: building a deck, shuffling, point values |
| `js/rules.js` | The rules: dealing, taking turns, clearing lines, scoring. Knows nothing about the screen. |
| `js/bots.js` | How the Easy and Smart bots decide what to do |
| `js/ui.js` | Draws everything on the page and handles your clicks |
| `index.html` | The page layout |
| `style.css` | Colors, sizes, and card styling |
| `tests/rules.test.js` | Automated checks that the rules and bots work |

The main idea: all the game's information lives in one `game` object.
`rules.js` has functions that change it (`revealStartingCard`,
`drawFromDeck`, `replaceCard`, …), and after every change `ui.js` calls `render()` to redraw the
whole table from that object.

## Running the tests

With [Node.js](https://nodejs.org) installed, from the top folder of the repo:

```
node --test golf/tests/*.test.js
```

The tests check the scoring and clearing rules, then have bots play hundreds
of complete games against each other.

## Tips for tinkering

- Open `index.html?fast` to make the bots play almost instantly.
- Press F12 in your browser to open the developer tools; the **Console** tab
  shows any errors.
- Things to try: change `BOT_DELAY` in `ui.js`, change a card's points in
  `cardValue` in `cards.js`, or change the `2.5` in `smartChooseSource` in
  `bots.js` to see how the Smart bot plays differently.
