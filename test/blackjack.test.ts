import assert from "node:assert/strict";
import test from "node:test";
import {
  createShuffledDeck,
  canDouble,
  canHit,
  canSplit,
  double,
  getHandValue,
  hit,
  split,
  stand,
  startBlackjackGame,
  type Card,
} from "../src/services/blackjack.ts";
import {
  renderBlackjackGif,
  renderBlackjackTable,
} from "../src/services/blackjack-renderer.ts";
import {
  createCardEmojiMap,
  formatCardHand,
  getCardEmojiName,
  getRequiredCardEmojiNames,
} from "../src/services/blackjack-display.ts";

function card(rank: Card["rank"], suit: Card["suit"] = "♠"): Card {
  return { rank, suit };
}

function gameWithTopCards(...cards: Card[]) {
  return startBlackjackGame(cards);
}

test("shuffled deck has all 52 unique cards", () => {
  const deck = createShuffledDeck(() => 0.5);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(({ rank, suit }) => `${rank}${suit}`)).size, 52);
});

test("aces count as eleven when possible and one when needed", () => {
  assert.equal(getHandValue([card("A"), card("9")]), 20);
  assert.equal(getHandValue([card("A"), card("9"), card("5")]), 15);
  assert.equal(getHandValue([card("A"), card("A"), card("9")]), 21);
});

test("a natural blackjack wins unless the dealer also has one", () => {
  const naturalWin = gameWithTopCards(
    card("A"),
    card("9"),
    card("K", "♥"),
    card("7", "♥"),
  );
  const naturalPush = gameWithTopCards(
    card("A"),
    card("K"),
    card("K", "♥"),
    card("A", "♥"),
  );

  assert.equal(naturalWin.status, "finished");
  assert.equal(naturalWin.playerHands[0]!.outcome, "win");
  assert.equal(naturalPush.playerHands[0]!.outcome, "push");
});

test("hitting above 21 loses immediately", () => {
  const game = gameWithTopCards(
    card("10"),
    card("6", "♥"),
    card("8", "♦"),
    card("9", "♣"),
    card("5", "♥"),
  );

  hit(game);
  assert.equal(game.status, "finished");
  assert.equal(game.playerHands[0]!.outcome, "loss");
});

test("dealer hits below 17 and a tied total is a push", () => {
  const game = gameWithTopCards(
    card("10"),
    card("10", "♥"),
    card("7", "♦"),
    card("6", "♣"),
    card("A", "♥"),
  );

  stand(game);
  assert.deepEqual(game.dealerHand, [
    card("10", "♥"),
    card("6", "♣"),
    card("A", "♥"),
  ]);
  assert.equal(game.playerHands[0]!.outcome, "push");
});

test("double draws exactly one card and then resolves the hand", () => {
  const game = gameWithTopCards(
    card("5"),
    card("10", "♥"),
    card("6", "♦"),
    card("7", "♣"),
    card("10", "♠"),
  );

  assert.equal(canSplit(game), false);
  assert.equal(canDouble(game), true);
  double(game);
  assert.equal(game.playerHands[0]!.cards.length, 3);
  assert.equal(game.deck.length, 0);
  assert.equal(game.status, "finished");
  assert.equal(game.playerHands[0]!.outcome, "win");
  assert.equal(canHit(game), false);

  const noLongerDoubles = gameWithTopCards(
    card("5"),
    card("10", "♥"),
    card("6", "♦"),
    card("7", "♣"),
    card("2", "♠"),
    card("3", "♥"),
  );
  hit(noLongerDoubles);
  assert.equal(canDouble(noLongerDoubles), false);
});

test("split hands are played in order and each gets its own result", () => {
  const game = gameWithTopCards(
    card("8"),
    card("6", "♥"),
    card("8", "♦"),
    card("10", "♣"),
    card("3", "♣"),
    card("10", "♠"),
    card("9", "♦"),
    card("A", "♣"),
  );

  assert.equal(canSplit(game), true);
  split(game);
  assert.equal(game.playerHands.length, 2);
  assert.equal(game.activeHandIndex, 0);
  assert.equal(canDouble(game), true);
  hit(game);
  stand(game);
  assert.equal(game.activeHandIndex, 1);
  stand(game);

  assert.equal(game.status, "finished");
  assert.deepEqual(game.playerHands.map(({ outcome }) => outcome), ["win", "win"]);
  assert.equal(getHandValue(game.playerHands[0]!.cards), 20);
  assert.equal(getHandValue(game.playerHands[1]!.cards), 18);
});

test("a matching pair created by a split can be split again", () => {
  const game = gameWithTopCards(
    card("8"),
    card("10", "♥"),
    card("8", "♦"),
    card("7", "♣"),
    card("8", "♣"),
    card("2", "♥"),
    card("3", "♦"),
    card("4", "♣"),
  );

  split(game);
  assert.equal(canSplit(game), true);
  split(game);
  assert.equal(game.playerHands.length, 3);
  assert.deepEqual(
    game.playerHands.map(({ cards }) => cards.map(({ rank }) => rank)),
    [["8", "3"], ["8", "4"], ["8", "2"]],
  );
  assert.equal(game.activeHandIndex, 0);
  const splitImage = renderBlackjackTable(game);
  assert.equal(splitImage.readUInt32BE(16), 1024);
  assert.equal(splitImage.readUInt32BE(20), 860);

  stand(game);
  assert.equal(game.activeHandIndex, 1);
  stand(game);
  assert.equal(game.activeHandIndex, 2);
  stand(game);
  assert.equal(game.status, "finished");
  assert.deepEqual(game.playerHands.map(({ outcome }) => outcome), [
    "loss",
    "loss",
    "loss",
  ]);
});

test("split aces receive one card each and finish their hands", () => {
  const game = gameWithTopCards(
    card("A"),
    card("10", "♥"),
    card("A", "♦"),
    card("7", "♣"),
    card("K", "♣"),
    card("8", "♠"),
  );

  split(game);
  assert.equal(game.playerHands[0]!.stood, true);
  assert.equal(game.playerHands[1]!.stood, true);
  assert.equal(game.status, "finished");
  assert.deepEqual(game.playerHands.map(({ outcome }) => outcome), ["win", "win"]);
});

test("table renderer creates a PNG and reveals the dealer hand when the game ends", () => {
  const game = gameWithTopCards(
    card("10"),
    card("6", "♥"),
    card("7", "♦"),
    card("9", "♣"),
    card("5", "♥"),
  );
  const playingImage = renderBlackjackTable(game);

  assert.deepEqual([...playingImage.subarray(0, 8)], [
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  assert.equal(playingImage.readUInt32BE(16), 1024);
  assert.equal(playingImage.readUInt32BE(20), 860);

  stand(game);
  const finishedImage = renderBlackjackTable(game);
  assert.notDeepEqual(finishedImage, playingImage);
});

test("card transitions render as a valid animated GIF", () => {
  const game = gameWithTopCards(
    card("10"),
    card("6", "♥"),
    card("7", "♦"),
    card("9", "♣"),
    card("5", "♥"),
  );
  hit(game);

  const animation = renderBlackjackGif(game, {
    type: "deal",
    hand: "player",
    cardIndex: 2,
  });
  const staticImage = renderBlackjackGif(game);

  assert.equal(animation.toString("ascii", 0, 6), "GIF89a");
  assert.equal(animation.at(-1), 0x3b);
  assert.ok(animation.length > staticImage.length);
  assert.equal(animation.readUInt16LE(6), 1024);
  assert.equal(animation.readUInt16LE(8), 860);
});

test("card emoji names use rank and suit names without face-card suffixes", () => {
  assert.equal(getCardEmojiName(card("10", "♦")), "10_of_diamonds");
  assert.equal(getCardEmojiName(card("A", "♠")), "ace_of_spades");
  assert.equal(getCardEmojiName(card("Q", "♠")), "queen_of_spades");
  assert.equal(getCardEmojiName(card("K", "♥")), "king_of_hearts");
  assert.equal(getCardEmojiName(card("J", "♣")), "jack_of_clubs");
  assert.equal(getRequiredCardEmojiNames().length, 52);
});

test("card emoji formatter displays custom emojis and hides the dealer hole card", () => {
  const emojiByName = createCardEmojiMap(
    getRequiredCardEmojiNames().map((name) => ({
      name,
      toString: () => `<:${name}:123>`,
    })),
  );
  const hand = [card("7", "♣"), card("2", "♦"), card("Q", "♠")];

  assert.equal(
    formatCardHand(hand, emojiByName),
    "<:7_of_clubs:123>  <:2_of_diamonds:123>  <:queen_of_spades:123>",
  );
  assert.equal(
    formatCardHand(hand, emojiByName, true),
    "<:7_of_clubs:123>  🂠",
  );
});

test("missing required card emojis are reported", () => {
  assert.throws(
    () => createCardEmojiMap([]),
    /Missing blackjack application emojis: ace_of_spades/,
  );
});
