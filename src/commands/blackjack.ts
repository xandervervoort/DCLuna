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
  createShuffledDeck,
  getHandValue,
  hit,
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

function renderCards(cards: readonly BlackjackGame["playerHand"][number][]): string {
  return cards.map(({ rank, suit }) => `${rank}${suit}`).join("  ") || "—";
}

function renderGame(game: BlackjackGame, imageName: string): EmbedBuilder {
  const playerCards = renderCards(game.playerHand);
  const dealerCards = game.status === "playing"
    ? `${game.dealerHand[0]!.rank}${game.dealerHand[0]!.suit}  🂠`
    : renderCards(game.dealerHand);
  const embed = new EmbedBuilder()
    .setColor(game.outcome === "win" ? 0x39a96b : game.outcome === "loss" ? 0xc94b4b : 0xc8a75e)
    .setTitle("Blackjack")
    .addFields(
      {
        name: `Dealer${game.status === "playing" ? "" : ` — ${getHandValue(game.dealerHand)}`}`,
        value: dealerCards,
        inline: true,
      },
      {
        name: `Your hand — ${getHandValue(game.playerHand)}`,
        value: playerCards,
        inline: true,
      },
    )
    .setImage(`attachment://${imageName}`);

  if (game.status === "playing") {
    embed.setDescription("Choose **Hit** or **Stand**.");
  } else if (game.status === "expired") {
    embed.setDescription("This game expired after 2 minutes of inactivity. Run `/blackjack` to play again.");
  } else if (game.outcome === "win") {
    embed.setDescription("**You win!**");
  } else if (game.outcome === "loss") {
    embed.setDescription("**Dealer wins.**");
  } else {
    embed.setDescription("**Push — it's a tie.**");
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

function createButtons(disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("blackjack:hit")
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("blackjack:stand")
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
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

export const blackjackCommand: ChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of blackjack."),

  async execute(interaction) {
    const game = startBlackjackGame(createShuffledDeck());
    let revision = 0;
    const imageName = `blackjack-${revision}.gif`;
    const initialTransition: BlackjackTransition | undefined =
      game.status === "playing"
        ? { type: "deal", hand: "player", cardIndex: 1 }
        : undefined;
    await interaction.reply({
      embeds: [renderGame(game, imageName)],
      components: [createButtons(game.status !== "playing")],
      files: createGameFiles(game, imageName, initialTransition),
    });

    if (game.status !== "playing") {
      return;
    }

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      idle: GAME_TIMEOUT_MS,
    });
    let actionQueue = Promise.resolve();

    collector.on("collect", (buttonInteraction) => {
      actionQueue = actionQueue
        .then(async () => {
          if (buttonInteraction.user.id !== interaction.user.id) {
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

          await buttonInteraction.deferUpdate();
          const previousPlayerCardCount = game.playerHand.length;
          const previousDealerCardCount = game.dealerHand.length;
          let transition: BlackjackTransition;
          if (buttonInteraction.customId === "blackjack:hit") {
            hit(game);
            transition = {
              type: "deal",
              hand: "player",
              cardIndex: previousPlayerCardCount,
            };
          } else if (buttonInteraction.customId === "blackjack:stand") {
            stand(game);
            transition = game.dealerHand.length > previousDealerCardCount
              ? {
                  type: "deal",
                  hand: "dealer",
                  cardIndex: game.dealerHand.length - 1,
                }
              : { type: "reveal", cardIndex: 1 };
          } else {
            throw new Error(`Unknown blackjack button: ${buttonInteraction.customId}`);
          }

          revision += 1;
          const updatedImageName = `blackjack-${revision}.gif`;
          await interaction.editReply({
            embeds: [renderGame(game, updatedImageName)],
            components: [createButtons(game.status !== "playing")],
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
      if (reason === "idle" && game.status === "playing") {
        game.status = "expired";
        actionQueue = actionQueue
          .then(async () => {
            revision += 1;
            const updatedImageName = `blackjack-${revision}.gif`;
            await interaction.editReply({
              embeds: [renderGame(game, updatedImageName)],
              components: [createButtons(true)],
              attachments: [],
              files: createGameFiles(game, updatedImageName),
            });
          })
          .catch((error: unknown) => {
            if (!isUnknownMessageError(error)) {
              console.error("Failed to expire the blackjack game message.", error);
            }
          });
      }
    });
  },
};
