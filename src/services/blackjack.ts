export const CARD_SUITS = ["♠", "♥", "♦", "♣"] as const;
export const CARD_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export type Card = {
  rank: (typeof CARD_RANKS)[number];
  suit: (typeof CARD_SUITS)[number];
};

export type GameOutcome = "win" | "loss" | "push";
export type GameStatus = "playing" | "finished" | "expired";

export type BlackjackGame = {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  status: GameStatus;
  outcome?: GameOutcome;
};

export function createShuffledDeck(random: () => number = Math.random): Card[] {
  const deck = CARD_SUITS.flatMap((suit) =>
    CARD_RANKS.map((rank) => ({ rank, suit })),
  );

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }

  return deck;
}

export function getHandValue(hand: readonly Card[]): number {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function isNatural(hand: readonly Card[]): boolean {
  return hand.length === 2 && getHandValue(hand) === 21;
}

function finish(game: BlackjackGame, outcome: GameOutcome): void {
  game.status = "finished";
  game.outcome = outcome;
}

function draw(game: BlackjackGame): Card {
  const card = game.deck.shift();
  if (!card) {
    throw new Error("The blackjack deck is empty.");
  }
  return card;
}

function resolveDealerTurn(game: BlackjackGame): void {
  while (getHandValue(game.dealerHand) < 17) {
    game.dealerHand.push(draw(game));
  }

  const playerTotal = getHandValue(game.playerHand);
  const dealerTotal = getHandValue(game.dealerHand);

  if (dealerTotal > 21 || playerTotal > dealerTotal) {
    finish(game, "win");
  } else if (playerTotal < dealerTotal) {
    finish(game, "loss");
  } else {
    finish(game, "push");
  }
}

export function startBlackjackGame(deck: readonly Card[]): BlackjackGame {
  if (deck.length < 4) {
    throw new RangeError("A blackjack game needs at least four cards to deal.");
  }

  const cards = [...deck];
  const game: BlackjackGame = {
    deck: cards.slice(4),
    playerHand: [cards[0]!, cards[2]!],
    dealerHand: [cards[1]!, cards[3]!],
    status: "playing",
  };

  const playerNatural = isNatural(game.playerHand);
  const dealerNatural = isNatural(game.dealerHand);

  if (playerNatural || dealerNatural) {
    if (playerNatural && dealerNatural) {
      finish(game, "push");
    } else {
      finish(game, playerNatural ? "win" : "loss");
    }
  }

  return game;
}

export function hit(game: BlackjackGame): void {
  if (game.status !== "playing") {
    throw new Error("This blackjack game is no longer active.");
  }

  game.playerHand.push(draw(game));
  const playerTotal = getHandValue(game.playerHand);

  if (playerTotal > 21) {
    finish(game, "loss");
  } else if (playerTotal === 21) {
    resolveDealerTurn(game);
  }
}

export function stand(game: BlackjackGame): void {
  if (game.status !== "playing") {
    throw new Error("This blackjack game is no longer active.");
  }

  resolveDealerTurn(game);
}
