import { Client, Events, GatewayIntentBits } from "discord.js";
import { registerInteractionCreate } from "./events/interactionCreate.ts";
import {
  getRequiredEnvironmentVariable,
  loadProjectEnvironment,
} from "./utils/environment.ts";

loadProjectEnvironment();

async function startBot(): Promise<void> {
  const token = getRequiredEnvironmentVariable("DISCORD_TOKEN");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  registerInteractionCreate(client);
  await client.login(token);
}

void startBot().catch((error: unknown) => {
  console.error("Failed to start the bot.", error);
  process.exitCode = 1;
});