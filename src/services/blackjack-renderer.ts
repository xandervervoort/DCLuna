import { createCanvas } from "@napi-rs/canvas";
import type { BlackjackGame, Card } from "./blackjack.ts";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 560;
const CARD_GAP = 14;
const RED_SUITS = new Set(["♥", "♦"]);

function drawCard(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  card: Card | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 10);
  context.clip();

  if (!card) {
    context.fillStyle = "#183d67";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#d4b568";
    context.lineWidth = 3;
    context.strokeRect(x + 8, y + 8, width - 16, height - 16);
    context.fillStyle = "#d4b568";
    context.font = `bold ${Math.max(26, width * 0.42)}px serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("★", x + width / 2, y + height / 2);
  } else {
    context.fillStyle = "#fffdf7";
    context.fillRect(x, y, width, height);
    const color = RED_SUITS.has(card.suit) ? "#c43a40" : "#18222c";
    const cornerFontSize = Math.max(12, width * 0.2);
    context.fillStyle = color;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.font = `bold ${cornerFontSize}px sans-serif`;
    context.fillText(card.rank, x + width * 0.1, y + height * 0.07);
    context.font = `${cornerFontSize}px sans-serif`;
    context.fillText(card.suit, x + width * 0.1, y + height * 0.07 + cornerFontSize);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold ${Math.max(22, width * 0.42)}px serif`;
    context.fillText(card.suit, x + width / 2, y + height / 2);
  }

  context.restore();
  context.strokeStyle = "#f4e8cc";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x, y, width, height, 10);
  context.stroke();
}

function drawHand(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  cards: readonly (Card | undefined)[],
  y: number,
): void {
  const maxCardWidth = 112;
  const maxCardsWidth = CANVAS_WIDTH - 100;
  const cardWidth = Math.min(
    maxCardWidth,
    (maxCardsWidth - CARD_GAP * (cards.length - 1)) / cards.length,
  );
  const cardHeight = cardWidth * 1.42;
  const handWidth = cardWidth * cards.length + CARD_GAP * (cards.length - 1);
  const startX = (CANVAS_WIDTH - handWidth) / 2;

  cards.forEach((card, index) => {
    drawCard(
      context,
      card,
      startX + index * (cardWidth + CARD_GAP),
      y,
      cardWidth,
      cardHeight,
    );
  });
}

export function renderBlackjackTable(game: BlackjackGame): Buffer {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  background.addColorStop(0, "#176143");
  background.addColorStop(1, "#0b3e31");
  context.fillStyle = background;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  context.strokeStyle = "#c8a75e";
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(16, 16, CANVAS_WIDTH - 32, CANVAS_HEIGHT - 32, 24);
  context.stroke();

  context.fillStyle = "#f7e9c7";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 30px sans-serif";
  context.fillText("BLACKJACK", CANVAS_WIDTH / 2, 54);

  context.font = "bold 18px sans-serif";
  context.fillText("DEALER", CANVAS_WIDTH / 2, 104);
  const dealerCards =
    game.status === "playing"
      ? [game.dealerHand[0], undefined]
      : game.dealerHand;
  drawHand(context, dealerCards, 124);

  context.strokeStyle = "rgba(247, 233, 199, 0.35)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(100, 342);
  context.lineTo(CANVAS_WIDTH - 100, 342);
  context.stroke();

  context.fillStyle = "#f7e9c7";
  context.font = "bold 18px sans-serif";
  context.fillText("YOUR HAND", CANVAS_WIDTH / 2, 382);
  drawHand(context, game.playerHand, 404);

  return canvas.toBuffer("image/png");
}
