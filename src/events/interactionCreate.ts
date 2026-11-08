import { Events, MessageFlags, type Client } from "discord.js";
import { commands } from "../commands/index.ts";

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Command /${interaction.commandName} failed.`, error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: "The command failed. Please try again later.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "The command failed. Please try again later.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (responseError) {
        console.error("Failed to report the command error to the user.", responseError);
      }
    }
  });
}
