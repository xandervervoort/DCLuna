# DCLuna
A discord i am making that has its own inteligence used to chat to the users.

## Running the bot

1. Copy `.env.example` to `.env` in the project root and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Both the bot and deploy script load this same file, regardless of the current working directory.
2. Optionally set `DISCORD_GUILD_ID` to register commands in one development server instead of globally. In guild mode, deployment clears global commands and replaces that guild's command list. Without it, deployment replaces the global command list; it cannot clear guild commands unless their guild is configured.
3. Invite the application with the `bot` and `applications.commands` scopes.
4. Run `npm run deploy` to register slash commands, then `npm start` to start the bot.

Use `npm test` to run the blackjack rule tests and `npm run typecheck` to check TypeScript.

## `/blackjack`

The command starts a public, no-wager, single-player blackjack game with locally generated card art. The same embed message is updated in place after every move; only the player who started the game can use **Hit** or **Stand**. Unauthorized button clicks receive a private notice. The table uses larger card faces, score badges, and short deal/reveal GIF transitions. Aces count as 1 or 11, face cards count as 10, a two-card 21 is a natural blackjack, and the dealer stands on 17 (including soft 17). A tie is a push. Games expire after two minutes without a move. Local graphics are rendered with `@napi-rs/canvas` and encoded with `gifenc`.
