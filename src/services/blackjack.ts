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

export type PlayerHand = {
  cards: Card[];
  stood: boolean;
  splitAces: boolean;
  outcome?: GameOutcome;
};

export type BlackjackGame = {
  deck: Card[];
  playerHands: PlayerHand[];
  activeHandIndex: number;
  dealerHand: Card[];
  status: GameStatus;
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

function isPair(hand: PlayerHand): boolean {
  return hand.cards.length === 2 && hand.cards[0]!.rank === hand.cards[1]!.rank;
}

function draw(game: BlackjackGame): Card {
  const card = game.deck.shift();
  if (!card) {
    throw new Error("The blackjack deck is empty.");
  }
  return card;
}

function resolveDealerTurn(game: BlackjackGame): void {
  if (game.playerHands.some((hand) => getHandValue(hand.cards) <= 21)) {
    while (getHandValue(game.dealerHand) < 17) {
      game.dealerHand.push(draw(game));
    }
  }

  const dealerTotal = getHandValue(game.dealerHand);
  for (const hand of game.playerHands) {
    const playerTotal = getHandValue(hand.cards);
    hand.outcome =
      playerTotal > 21 || (dealerTotal <= 21 && playerTotal < dealerTotal)
        ? "loss"
        : dealerTotal > 21 || playerTotal > dealerTotal
          ? "win"
          : "push";
  }
  game.status = "finished";
}

function advanceHand(game: BlackjackGame): void {
  const nextIndex = game.playerHands.findIndex(
    (hand, index) => index > game.activeHandIndex && !hand.stood,
  );
  if (nextIndex !== -1) {
    game.activeHandIndex = nextIndex;
    return;
  }

  resolveDealerTurn(game);
}

export function startBlackjackGame(deck: readonly Card[]): BlackjackGame {
  if (deck.length < 4) {
    throw new RangeError("A blackjack game needs at least four cards to deal.");
  }

  const cards = [...deck];
  const playerHand: PlayerHand = {
    cards: [cards[0]!, cards[2]!],
    stood: false,
    splitAces: false,
  };
  const game: BlackjackGame = {
    deck: cards.slice(4),
    playerHands: [playerHand],
    activeHandIndex: 0,
    dealerHand: [cards[1]!, cards[3]!],
    status: "playing",
  };

  const playerNatural = isNatural(playerHand.cards);
  const dealerNatural = isNatural(game.dealerHand);
  if (playerNatural || dealerNatural) {
    playerHand.outcome =
      playerNatural && dealerNatural ? "push" : playerNatural ? "win" : "loss";
    playerHand.stood = true;
    game.status = "finished";
  }

  return game;
}

export function canHit(game: BlackjackGame): boolean {
  const hand = game.playerHands[game.activeHandIndex];
  return (
    game.status === "playing" &&
    hand !== undefined &&
    !hand.stood &&
    !hand.splitAces &&
    getHandValue(hand.cards) < 21
  );
}

export function canDouble(game: BlackjackGame): boolean {
  const hand = game.playerHands[game.activeHandIndex];
  return canHit(game) && hand?.cards.length === 2;
}

export function canSplit(game: BlackjackGame): boolean {
  const hand = game.playerHands[game.activeHandIndex];
  return (
    game.status === "playing" &&
    hand !== undefined &&
    isPair(hand) &&
    (!hand.stood || hand.splitAces)
  );
}

export function hit(game: BlackjackGame): void {
  if (!canHit(game)) {
    throw new Error("You cannot hit this blackjack hand.");
  }

  const hand = game.playerHands[game.activeHandIndex]!;
  hand.cards.push(draw(game));
  if (getHandValue(hand.cards) >= 21) {
    hand.stood = true;
    advanceHand(game);
  }
}

export function stand(game: BlackjackGame): void {
  if (!canHit(game)) {
    throw new Error("You cannot stand on this blackjack hand.");
  }

  game.playerHands[game.activeHandIndex]!.stood = true;
  advanceHand(game);
}

export function double(game: BlackjackGame): void {
  if (!canDouble(game)) {
    throw new Error("You can only double on an active two-card hand.");
  }

  const hand = game.playerHands[game.activeHandIndex]!;
  hand.cards.push(draw(game));
  hand.stood = true;
  advanceHand(game);
}

export function split(game: BlackjackGame): void {
  if (!canSplit(game)) {
    throw new Error("You can only split a matching-rank pair.");
  }
  if (game.deck.length < 2) {
    throw new RangeError("Splitting a hand needs at least two cards in the deck.");
  }

  const currentHand = game.playerHands[game.activeHandIndex]!;
  const splitAces = currentHand.cards[0]!.rank === "A";
  const leftHand: PlayerHand = {
    cards: [currentHand.cards[0]!, draw(game)],
    stood: false,
    splitAces,
  };
  const rightHand: PlayerHand = {
    cards: [currentHand.cards[1]!, draw(game)],
    stood: false,
    splitAces,
  };

  for (const hand of [leftHand, rightHand]) {
    if (splitAces || getHandValue(hand.cards) >= 21) {
      hand.stood = true;
    }
  }

  game.playerHands.splice(game.activeHandIndex, 1, leftHand, rightHand);
  if (!leftHand.stood) {
    return;
  }

  if (!rightHand.stood) {
    game.activeHandIndex += 1;
    return;
  }

  advanceHand(game);
}
