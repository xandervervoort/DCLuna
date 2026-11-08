import assert from "node:assert/strict";
import test from "node:test";
import {
  createShuffledDeck,
  getHandValue,
  hit,
  stand,
  startBlackjackGame,
  type Card,
} from "../src/services/blackjack.ts";
import {
  renderBlackjackGif,
  renderBlackjackTable,
} from "../src/services/blackjack-renderer.ts";

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
  assert.equal(naturalWin.outcome, "win");
  assert.equal(naturalPush.outcome, "push");
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
  assert.equal(game.outcome, "loss");
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
  assert.equal(game.outcome, "push");
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
  assert.equal(playingImage.readUInt32BE(20), 820);

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
  assert.equal(animation.readUInt16LE(8), 820);
});
