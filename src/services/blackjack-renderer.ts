import { createCanvas, type Canvas } from "@napi-rs/canvas";
import gifenc from "gifenc";
import { getHandValue, type BlackjackGame, type Card } from "./blackjack.ts";

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 860;
const CARD_GAP = 12;
const RED_SUITS = new Set(["♥", "♦"]);
const CREAM = "#fff8e9";
const GOLD = "#e5c27a";

type CanvasContext = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;
type HandName = "player" | "dealer";

export type BlackjackTransition =
  | { type: "deal"; hand: HandName; cardIndex: number; handIndex?: number }
  | { type: "reveal"; cardIndex: number };

function roundedRect(
  context: CanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawCard(
  context: CanvasContext,
  card: Card | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  scaleX = 1,
): void {
  const drawnWidth = Math.max(1, width * scaleX);
  const drawnX = x + (width - drawnWidth) / 2;
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 14;
  context.shadowOffsetY = 8;
  roundedRect(context, drawnX, y, drawnWidth, height, Math.min(15, drawnWidth / 8));
  context.fillStyle = "#fffdf7";
  context.fill();
  context.restore();

  context.save();
  roundedRect(context, drawnX, y, drawnWidth, height, Math.min(15, drawnWidth / 8));
  context.clip();

  if (!card) {
    context.fillStyle = "#183961";
    context.fillRect(drawnX, y, drawnWidth, height);
    context.strokeStyle = "#e3c36f";
    context.lineWidth = 2;
    for (let offset = -height; offset < drawnWidth + height; offset += 20) {
      context.beginPath();
      context.moveTo(drawnX + offset, y);
      context.lineTo(drawnX + offset + height, y + height);
      context.stroke();
    }
    const centerX = drawnX + drawnWidth / 2;
    const centerY = y + height / 2;
    context.beginPath();
    context.moveTo(centerX, centerY - 30);
    context.lineTo(centerX + 24, centerY);
    context.lineTo(centerX, centerY + 30);
    context.lineTo(centerX - 24, centerY);
    context.closePath();
    context.strokeStyle = "#f3dfa6";
    context.lineWidth = 3;
    context.stroke();
  } else {
    context.fillStyle = "#fffdf7";
    context.fillRect(drawnX, y, drawnWidth, height);
    const color = RED_SUITS.has(card.suit) ? "#c83e49" : "#18222c";
    const cornerFontSize = Math.max(17, drawnWidth * 0.19);
    context.fillStyle = color;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.font = `bold ${cornerFontSize}px sans-serif`;
    context.fillText(card.rank, drawnX + drawnWidth * 0.1, y + height * 0.065);
    context.font = `${cornerFontSize}px sans-serif`;
    context.fillText(
      card.suit,
      drawnX + drawnWidth * 0.1,
      y + height * 0.065 + cornerFontSize,
    );

    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold ${Math.max(38, drawnWidth * 0.5)}px serif`;
    context.fillText(card.suit, drawnX + drawnWidth / 2, y + height / 2);

    context.save();
    context.translate(drawnX + drawnWidth, y + height);
    context.rotate(Math.PI);
    context.textAlign = "left";
    context.textBaseline = "top";
    context.font = `bold ${cornerFontSize}px sans-serif`;
    context.fillText(card.rank, drawnWidth * 0.1, height * 0.065);
    context.font = `${cornerFontSize}px sans-serif`;
    context.fillText(card.suit, drawnWidth * 0.1, height * 0.065 + cornerFontSize);
    context.restore();
  }

  context.restore();
  context.strokeStyle = "#fff5dc";
  context.lineWidth = 2;
  roundedRect(context, drawnX, y, drawnWidth, height, Math.min(15, drawnWidth / 8));
  context.stroke();
}

function cardPositions(
  count: number,
  y: number,
  centerX = CANVAS_WIDTH / 2,
  maxCardWidth = 156,
  maxHandWidth = CANVAS_WIDTH - 104,
): { x: number; y: number; width: number; height: number }[] {
  if (count === 0) return [];
  const width = Math.min(
    maxCardWidth,
    (maxHandWidth - CARD_GAP * (count - 1)) / count,
  );
  const height = width * 1.42;
  const handWidth = count * width + (count - 1) * CARD_GAP;
  const startX = centerX - handWidth / 2;

  return Array.from({ length: count }, (_value, index) => ({
    x: startX + index * (width + CARD_GAP),
    y,
    width,
    height,
  }));
}

function drawPill(
  context: CanvasContext,
  text: string,
  x: number,
  y: number,
  width: number,
  color = "rgba(3, 41, 34, 0.82)",
): void {
  roundedRect(context, x, y, width, 38, 19);
  context.fillStyle = color;
  context.fill();
  context.fillStyle = CREAM;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 16px sans-serif";
  context.fillText(text, x + width / 2, y + 20);
}

function drawHand(
  context: CanvasContext,
  cards: readonly (Card | undefined)[],
  y: number,
  transition: BlackjackTransition | undefined,
  handName: HandName,
  progress: number,
  handIndex?: number,
  centerX = CANVAS_WIDTH / 2,
  maxCardWidth = 156,
  maxHandWidth = CANVAS_WIDTH - 104,
): void {
  const positions = cardPositions(cards.length, y, centerX, maxCardWidth, maxHandWidth);
  cards.forEach((card, index) => {
    const position = positions[index]!;
    if (
      transition?.type === "deal" &&
      transition.hand === handName &&
      (handName !== "player" || transition.handIndex === handIndex) &&
      transition.cardIndex === index
    ) {
      const eased = 1 - (1 - progress) ** 3;
      const startX = centerX - position.width / 2;
      const startY = 338 - position.height / 2;
      drawCard(
        context,
        card,
        startX + (position.x - startX) * eased,
        startY + (position.y - startY) * eased,
        position.width,
        position.height,
      );
      return;
    }

    if (
      transition?.type === "reveal" &&
      handName === "dealer" &&
      transition.cardIndex === index
    ) {
      const scaleX = progress < 0.5 ? 1 - progress * 2 : (progress - 0.5) * 2;
      drawCard(
        context,
        progress < 0.5 ? undefined : card,
        position.x,
        position.y,
        position.width,
        position.height,
        scaleX,
      );
      return;
    }

    drawCard(context, card, position.x, position.y, position.width, position.height);
  });
}

function drawTable(
  game: BlackjackGame,
  transition?: BlackjackTransition,
  progress = 1,
): Canvas {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  const background = context.createRadialGradient(
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    70,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    760,
  );
  background.addColorStop(0, "#167256");
  background.addColorStop(1, "#063b32");
  context.fillStyle = background;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  context.strokeStyle = "#9c7841";
  context.lineWidth = 12;
  roundedRect(context, 14, 14, CANVAS_WIDTH - 28, CANVAS_HEIGHT - 28, 32);
  context.stroke();
  context.strokeStyle = GOLD;
  context.lineWidth = 2;
  roundedRect(context, 25, 25, CANVAS_WIDTH - 50, CANVAS_HEIGHT - 50, 25);
  context.stroke();

  context.fillStyle = CREAM;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 27px sans-serif";
  context.fillText("BLACKJACK", CANVAS_WIDTH / 2, 57);
  drawPill(context, "DEALER", CANVAS_WIDTH / 2 - 88, 82, 176);
  if (game.status === "playing") {
    drawPill(
      context,
      `SHOWING  ${getHandValue([game.dealerHand[0]!])}`,
      CANVAS_WIDTH / 2 - 80,
      122,
      160,
    );
  } else {
    drawPill(
      context,
      `SCORE  ${getHandValue(game.dealerHand)}`,
      CANVAS_WIDTH / 2 - 75,
      122,
      150,
    );
  }

  const dealerCards = game.status === "playing"
    ? [game.dealerHand[0], undefined]
    : game.dealerHand;
  drawHand(context, dealerCards, 164, transition, "dealer", progress);

  const dividerY = game.playerHands.length > 1 ? 420 : 430;
  context.strokeStyle = "rgba(244, 223, 174, 0.45)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(92, dividerY);
  context.lineTo(CANVAS_WIDTH - 92, dividerY);
  context.stroke();

  const statusText = game.status === "playing"
    ? game.playerHands.length > 1
      ? `HAND ${game.activeHandIndex + 1} OF ${game.playerHands.length}`
      : "YOUR TURN"
    : game.status === "expired"
      ? "GAME EXPIRED"
      : game.playerHands.every((hand) => hand.outcome === "win")
        ? "YOU WIN"
        : game.playerHands.every((hand) => hand.outcome === "loss")
          ? "DEALER WINS"
          : "ROUND OVER";
  const statusColor = game.playerHands.some((hand) => hand.outcome === "win")
    ? "rgba(14, 103, 62, 0.95)"
    : game.playerHands.every((hand) => hand.outcome === "loss")
      ? "rgba(139, 43, 49, 0.95)"
      : undefined;
  drawPill(context, statusText, CANVAS_WIDTH / 2 - 100, dividerY - 19, 200, statusColor);

  if (game.playerHands.length === 1) {
    drawPill(context, "YOUR HAND", CANVAS_WIDTH / 2 - 100, 463, 200);
    drawPill(
      context,
      `SCORE  ${getHandValue(game.playerHands[0]!.cards)}`,
      CANVAS_WIDTH / 2 - 75,
      503,
      150,
    );
    drawHand(
      context,
      game.playerHands[0]!.cards,
      555,
      transition,
      "player",
      progress,
      0,
    );
  } else {
    const columnWidth = 460;
    const rowGap = 178;
    const top = 455;
    game.playerHands.forEach((hand, index) => {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const centerX = column === 0 ? 270 : CANVAS_WIDTH - 270;
      const panelTop = top + row * rowGap;
      const isActive = game.status === "playing" && index === game.activeHandIndex;

      context.save();
      roundedRect(context, centerX - columnWidth / 2, panelTop, columnWidth, 168, 18);
      context.fillStyle = isActive ? "rgba(227, 195, 111, 0.15)" : "rgba(3, 41, 34, 0.3)";
      context.fill();
      context.strokeStyle = isActive ? GOLD : "rgba(244, 223, 174, 0.3)";
      context.lineWidth = isActive ? 3 : 1;
      context.stroke();
      context.restore();

      context.fillStyle = CREAM;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "bold 15px sans-serif";
      const label = hand.outcome
        ? `HAND ${index + 1} · ${hand.outcome.toUpperCase()}`
        : isActive
          ? `HAND ${index + 1} · YOUR TURN`
          : `HAND ${index + 1} · ${hand.stood ? "STOOD" : "WAITING"}`;
      context.fillText(`${label}  ·  ${getHandValue(hand.cards)}`, centerX, panelTop + 20);
      drawHand(
        context,
        hand.cards,
        panelTop + 33,
        transition,
        "player",
        progress,
        index,
        centerX,
        106,
        columnWidth - 24,
      );
    });
  }

  return canvas;
}

export function renderBlackjackTable(game: BlackjackGame): Buffer {
  return drawTable(game).toBuffer("image/png");
}

export function renderBlackjackGif(
  game: BlackjackGame,
  transition?: BlackjackTransition,
): Buffer {
  const frameCount = transition ? 7 : 1;
  const frames = Array.from({ length: frameCount }, (_value, index) => {
    const progress = frameCount === 1 ? 1 : index / (frameCount - 1);
    const canvas = drawTable(game, transition, progress);
    return canvas.getContext("2d").getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
  });
  const palette = gifenc.quantize(frames[0]!, 192);
  const gif = gifenc.GIFEncoder();

  frames.forEach((frame, index) => {
    gif.writeFrame(gifenc.applyPalette(frame, palette), CANVAS_WIDTH, CANVAS_HEIGHT, {
      ...(index === 0 ? { palette, repeat: -1 } : {}),
      delay: index === frames.length - 1 ? 900 : 55,
    });
  });
  gif.finish();
  return Buffer.from(gif.bytes());
}
