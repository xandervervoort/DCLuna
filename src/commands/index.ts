import type { ChatInputCommand } from "../types/command.ts";
import { blackjackCommand } from "./blackjack.ts";

export const commands: ChatInputCommand[] = [blackjackCommand];
