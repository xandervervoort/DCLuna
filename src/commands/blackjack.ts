import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
} from "discord.js";
import type { ChatInputCommand } from "../types/command.ts";
import {
  renderBlackjackGif,
  type BlackjackTransition,
} from "../services/blackjack-renderer.ts";
import {
  createCardEmojiMap,
  formatCardHand,
} from "../services/blackjack-display.ts";
import {
  canDouble,
  canHit,
  canSplit,
  createShuffledDeck,
  double,
  getHandValue,
  hit,
  split,
  startBlackjackGame,
  stand,
  type BlackjackGame,
} from "../services/blackjack.ts";

const GAME_TIMEOUT_MS = 2 * 60 * 1000;

function isUnknownMessageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 10008
  );
}

function renderGame(
  game: BlackjackGame,
  imageName: string,
  emojiByName: ReadonlyMap<string, string>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(game.status === "playing" ? 0x258764 : 0xc8a75e)
    .setTitle("Blackjack")
    .addFields(
      {
        name: `Dealer${game.status === "playing" ? ` · showing ${getHandValue([game.dealerHand[0]!])}` : ` · ${getHandValue(game.dealerHand)}`}`,
        value: formatCardHand(
          game.dealerHand,
          emojiByName,
          game.status === "playing",
        ),
        inline: false,
      },
      ...game.playerHands.map((hand, index) => ({
        name: `Hand ${index + 1}${index === game.activeHandIndex && game.status === "playing" ? " · Your turn" : hand.outcome ? ` · ${hand.outcome.toUpperCase()}` : ""} — ${getHandValue(hand.cards)}`,
        value: formatCardHand(hand.cards, emojiByName),
        inline: true,
      })),
    )
    .setImage(`attachment://${imageName}`);

  if (game.status === "playing") {
    embed.setDescription(
      game.playerHands.length > 1
        ? `Playing hand ${game.activeHandIndex + 1} of ${game.playerHands.length}. Choose an action below.`
        : "Choose an action below.",
    );
  } else if (game.status === "expired") {
    embed.setDescription("This game expired after 2 minutes of inactivity. Use **Play Again** to start a new one.");
  } else {
    const wins = game.playerHands.filter((hand) => hand.outcome === "win").length;
    const losses = game.playerHands.filter((hand) => hand.outcome === "loss").length;
    const pushes = game.playerHands.filter((hand) => hand.outcome === "push").length;
    embed.setDescription(
      `Round over · ${wins} ${wins === 1 ? "win" : "wins"} · ${losses} ${losses === 1 ? "loss" : "losses"} · ${pushes} ${pushes === 1 ? "push" : "pushes"}`,
    );
  }

  return embed;
}

function createGameFiles(
  game: BlackjackGame,
  imageName: string,
  transition?: BlackjackTransition,
) {
  return [{ attachment: renderBlackjackGif(game, transition), name: imageName }];
}

function createButtons(game: BlackjackGame, revision: number): ActionRowBuilder<ButtonBuilder> {
  const disabled = game.status !== "playing";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`blackjack:${revision}:hit`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || !canHit(game)),
    new ButtonBuilder()
      .setCustomId(`blackjack:${revision}:stand`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !canHit(game)),
    new ButtonBuilder()
      .setCustomId(`blackjack:${revision}:double`)
      .setLabel("Double")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !canDouble(game)),
    new ButtonBuilder()
      .setCustomId(`blackjack:${revision}:split`)
      .setLabel("Split")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !canSplit(game)),
  );
}

function createRetryButton(revision: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`blackjack:${revision}:retry`)
      .setLabel("Play Again")
      .setStyle(ButtonStyle.Success),
  );
}

function createGameComponents(
  game: BlackjackGame,
  revision: number,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows = [createButtons(game, revision)];
  if (game.status !== "playing") {
    rows.push(createRetryButton(revision));
  }
  return rows;
}

function isStaleButton(interaction: ButtonInteraction, revision: number): boolean {
  const [, buttonRevision] = interaction.customId.split(":");
  return Number(buttonRevision) !== revision;
}

function isGameFinished(game: BlackjackGame): boolean {
  return game.status === "finished";
}

async function reportButtonError(
  error: unknown,
  interaction: ButtonInteraction,
): Promise<void> {
  console.error("Failed to process a blackjack button interaction.", error);
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "There was a problem processing that move. Please start a new game.",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "There was a problem processing that move. Please start a new game.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (responseError) {
    console.error("Failed to report the blackjack interaction error.", responseError);
  }
}

function startRetryCollector(
  message: Awaited<ReturnType<ButtonInteraction["fetchReply"]>>,
  ownerId: string,
  revision: number,
  emojiByName: ReadonlyMap<string, string>,
): void {
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
  });
  let actionQueue = Promise.resolve();
  let retryUsed = false;

  collector.on("collect", (buttonInteraction) => {
    actionQueue = actionQueue
      .then(async () => {
        if (buttonInteraction.user.id !== ownerId) {
          await buttonInteraction.reply({
            content: "Only the player who started this game can use these buttons.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (buttonInteraction.customId !== `blackjack:${revision}:retry`) {
          await buttonInteraction.reply({
            content: "This game has ended. Use **Play Again** to start a new one.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (retryUsed) {
          await buttonInteraction.reply({
            content: "A new game has already been started from this message.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        retryUsed = true;
        await buttonInteraction.deferUpdate();
        await message.edit({ components: [] });

        try {
          const game = startBlackjackGame(createShuffledDeck());
          const nextRevision = 0;
          const imageName = `blackjack-${nextRevision}.gif`;
          const transition: BlackjackTransition | undefined =
            game.status === "playing"
              ? { type: "deal", hand: "player", handIndex: 0, cardIndex: 1 }
              : undefined;
          const reply = await buttonInteraction.followUp({
            embeds: [renderGame(game, imageName, emojiByName)],
            components: createGameComponents(game, nextRevision),
            files: createGameFiles(game, imageName, transition),
          });
          startGameCollector(reply, ownerId, game, nextRevision, emojiByName);
        } catch (error) {
          console.error("Failed to start a retry blackjack game.", error);
          await buttonInteraction.followUp({
            content: "Could not start a new game. Please run `/blackjack` again.",
            flags: MessageFlags.Ephemeral,
          });
        }
        collector.stop("retry-used");
      })
      .catch((error: unknown) => {
        if (isUnknownMessageError(error)) {
          collector.stop("message-unavailable");
          return;
        }
        return reportButtonError(error, buttonInteraction);
      });
  });
}

function startGameCollector(
  message: Awaited<ReturnType<ButtonInteraction["fetchReply"]>>,
  ownerId: string,
  game: BlackjackGame,
  initialRevision: number,
  emojiByName: ReadonlyMap<string, string>,
): void {
  if (game.status !== "playing") {
    startRetryCollector(message, ownerId, initialRevision, emojiByName);
    return;
  }

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    idle: GAME_TIMEOUT_MS,
  });
  let revision = initialRevision;
  let actionQueue = Promise.resolve();

  collector.on("collect", (buttonInteraction) => {
    actionQueue = actionQueue
      .then(async () => {
        if (buttonInteraction.user.id !== ownerId) {
          await buttonInteraction.reply({
            content: "Only the player who started this game can use these buttons.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (game.status !== "playing") {
          await buttonInteraction.reply({
            content: "This game has already ended.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (isStaleButton(buttonInteraction, revision)) {
          await buttonInteraction.reply({
            content: "The game has updated. Please use the current buttons.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await buttonInteraction.deferUpdate();
        const previousHandIndex = game.activeHandIndex;
        const previousPlayerCardCount =
          game.playerHands[previousHandIndex]!.cards.length;
        const previousDealerCardCount = game.dealerHand.length;
        let transition: BlackjackTransition | undefined;
        const action = buttonInteraction.customId.split(":")[2];
        if (action === "hit") {
          hit(game);
          transition = {
            type: "deal",
            hand: "player",
            handIndex: previousHandIndex,
            cardIndex: previousPlayerCardCount,
          };
        } else if (action === "stand") {
          stand(game);
          if (game.dealerHand.length > previousDealerCardCount) {
            transition = {
              type: "deal",
              hand: "dealer",
              cardIndex: game.dealerHand.length - 1,
            };
          } else if (isGameFinished(game)) {
            transition = { type: "reveal", cardIndex: 1 };
          }
        } else if (action === "double") {
          double(game);
          transition = {
            type: "deal",
            hand: "player",
            handIndex: previousHandIndex,
            cardIndex: previousPlayerCardCount,
          };
        } else if (action === "split") {
          split(game);
          transition = {
            type: "deal",
            hand: "player",
            handIndex: previousHandIndex,
            cardIndex: 1,
          };
        } else {
          throw new Error(`Unknown blackjack button: ${action}`);
        }

        revision += 1;
        const updatedImageName = `blackjack-${revision}.gif`;
        await message.edit({
          embeds: [renderGame(game, updatedImageName, emojiByName)],
          components: createGameComponents(game, revision),
          attachments: [],
          files: createGameFiles(game, updatedImageName, transition),
        });

        if (game.status !== "playing") {
          collector.stop("game-over");
        }
      })
      .catch((error: unknown) => {
        if (isUnknownMessageError(error)) {
          collector.stop("message-unavailable");
          return;
        }
        return reportButtonError(error, buttonInteraction);
      });
  });

  collector.on("end", (_collected, reason) => {
    if (reason === "game-over") {
      startRetryCollector(message, ownerId, revision, emojiByName);
      return;
    }

    if (reason === "idle" && game.status === "playing") {
      game.status = "expired";
      actionQueue = actionQueue
        .then(async () => {
          revision += 1;
          const updatedImageName = `blackjack-${revision}.gif`;
          await message.edit({
            embeds: [renderGame(game, updatedImageName, emojiByName)],
            components: createGameComponents(game, revision),
            attachments: [],
            files: createGameFiles(game, updatedImageName),
          });
          startRetryCollector(message, ownerId, revision, emojiByName);
        })
        .catch((error: unknown) => {
          if (!isUnknownMessageError(error)) {
            console.error("Failed to expire the blackjack game message.", error);
          }
        });
    }
  });
}

export const blackjackCommand: ChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of blackjack."),

  async execute(interaction) {
    const applicationEmojis = await interaction.client.application.emojis.fetch();
    const emojiByName = createCardEmojiMap(applicationEmojis.values());
    const game = startBlackjackGame(createShuffledDeck());
    const revision = 0;
    const imageName = `blackjack-${revision}.gif`;
    const initialTransition: BlackjackTransition | undefined =
      game.status === "playing"
        ? { type: "deal", hand: "player", handIndex: 0, cardIndex: 1 }
        : undefined;
    await interaction.reply({
      embeds: [renderGame(game, imageName, emojiByName)],
      components: createGameComponents(game, revision),
      files: createGameFiles(game, imageName, initialTransition),
    });

    const message = await interaction.fetchReply();
    startGameCollector(message, interaction.user.id, game, revision, emojiByName);
  },
};
