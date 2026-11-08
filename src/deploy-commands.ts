import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.ts";
import {
  getRequiredEnvironmentVariable,
  loadProjectEnvironment,
} from "./utils/environment.ts";

loadProjectEnvironment();

async function deployCommands(): Promise<void> {
  const token = getRequiredEnvironmentVariable("DISCORD_TOKEN");
  const clientId = getRequiredEnvironmentVariable("DISCORD_CLIENT_ID");
  const guildId = process.env.DISCORD_GUILD_ID;
  const rest = new REST({ version: "10" }).setToken(token);
  const commandDefinitions = commands.map((command) => command.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandDefinitions,
    });
    console.log(
      `Cleared global slash commands and registered ${commands.length} command(s) in guild ${guildId}.`,
    );
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: commandDefinitions,
  });
  console.log(`Registered ${commands.length} slash command(s) globally.`);
}

void deployCommands().catch((error: unknown) => {
  console.error("Failed to register slash commands.", error);
  process.exitCode = 1;
});
