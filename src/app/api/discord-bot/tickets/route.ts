import {
  handleCreateDiscordTicket,
  handleGetDiscordTickets,
  handleUpdateDiscordTicket,
} from "@/lib/support/discordTicketCommands";

// GET /api/discord-bot/tickets — Hydrate a persistent Discord support card.
// Auth: requireBotToken (private key only). Errors: 400, 401, 404
export async function GET(request: Request) {
  return handleGetDiscordTickets(request);
}

// POST /api/discord-bot/tickets — Open a support case from the Discord flow.
// Auth: requireBotToken (private key only). Errors: 400, 401, 429
export async function POST(request: Request) {
  return handleCreateDiscordTicket(request);
}

// PATCH /api/discord-bot/tickets — Update, close, retriage or acknowledge delivery of a support case.
// Auth: requireBotToken (private key only). Errors: 400, 401, 404
export async function PATCH(request: Request) {
  return handleUpdateDiscordTicket(request);
}
