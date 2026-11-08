import { CARD_RANKS, CARD_SUITS, type Card } from "./blackjack.ts";

const SUIT_NAMES: Record<Card["suit"], string> = {
  "♠": "spades",
  "♥": "hearts",
  "♦": "diamonds",
  "♣": "clubs",
};

const RANK_NAMES: Record<Card["rank"], string> = {
  A: "ace",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  J: "jack",
  Q: "queen",
  K: "king",
};

export function getCardEmojiName(card: Card): string {
  return `${RANK_NAMES[card.rank]}_of_${SUIT_NAMES[card.suit]}`;
}

export function getRequiredCardEmojiNames(): string[] {
  return CARD_SUITS.flatMap((suit) =>
    CARD_RANKS.map((rank) => getCardEmojiName({ rank, suit }))
  );
}

export function createCardEmojiMap(
  emojis: Iterable<{ name: string; toString(): string }>,
): Map<string, string> {
  const emojiByName = new Map(
    Array.from(emojis, (emoji) => [emoji.name, emoji.toString()] as const),
  );
  const missingEmojis = getRequiredCardEmojiNames().filter(
    (name) => !emojiByName.has(name),
  );
  if (missingEmojis.length > 0) {
    throw new Error(
      `Missing blackjack application emojis: ${missingEmojis.join(", ")}`,
    );
  }
  return emojiByName;
}

export function formatCardHand(
  cards: readonly Card[],
  emojiByName: ReadonlyMap<string, string>,
  hideHoleCard = false,
): string {
  const shownCards = hideHoleCard ? cards.slice(0, 1) : cards;
  const renderedCards = shownCards.map((card) => {
    const emojiName = getCardEmojiName(card);
    const emoji = emojiByName.get(emojiName);
    if (!emoji) {
      throw new Error(`Missing blackjack application emoji: ${emojiName}`);
    }
    return emoji;
  });

  if (hideHoleCard) {
    renderedCards.push("🂠");
  }
  return renderedCards.join("  ") || "—";
}
