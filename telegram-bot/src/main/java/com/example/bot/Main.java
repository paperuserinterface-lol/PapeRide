package com.example.bot;

import io.github.cdimascio.dotenv.Dotenv;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;

/**
 * Entry point for the PapeRide Telegram bot.
 *
 * Reads credentials from the .env file in the telegram-bot folder:
 *   BOT_USERNAME           — the bot's Telegram username (without @)
 *   BOT_TOKEN              — the token you received from @BotFather
 *   WEBSITE_URL            — base URL of the PapeRide website, e.g. http://localhost:3000
 *   WEBSITE_INTERNAL_TOKEN — must equal TELEGRAM_INTERNAL_TOKEN on the website
 *
 * The website is the single source of truth for rides, so the bot refuses to
 * start when it cannot reach it: without the website it could neither book
 * nor notify anyone.
 */
public class Main {

    public static void main(String[] args) {
        Dotenv dotenv = Dotenv.load();

        String botUsername = dotenv.get("BOT_USERNAME");
        String botToken    = dotenv.get("BOT_TOKEN");

        if (botUsername == null || botUsername.isBlank()) {
            System.err.println("ERROR: BOT_USERNAME is not set in .env");
            System.exit(1);
        }
        if (botToken == null || botToken.isBlank()) {
            System.err.println("ERROR: BOT_TOKEN is not set in .env");
            System.exit(1);
        }

        String websiteUrl   = dotenv.get("WEBSITE_URL");
        String websiteToken = dotenv.get("WEBSITE_INTERNAL_TOKEN");

        if (websiteUrl == null || websiteUrl.isBlank()) {
            System.err.println("ERROR: WEBSITE_URL is not set in .env");
            System.exit(1);
        }
        if (websiteToken == null || websiteToken.isBlank()) {
            System.err.println("ERROR: WEBSITE_INTERNAL_TOKEN is not set in .env");
            System.exit(1);
        }

        WebsiteClient website = new WebsiteClient(websiteUrl, websiteToken);
        try {
            website.checkHealth();
            System.out.println("✅ Website reachable at " + websiteUrl);
        } catch (Exception e) {
            System.err.println("ERROR: PapeRide website is not reachable at "
                    + websiteUrl + " (" + e.getMessage() + ")");
            System.err.println("Start it first:  cd Website && npm start");
            System.exit(1);
        }

        try {
            TelegramBotsApi botsApi = new TelegramBotsApi(DefaultBotSession.class);
            botsApi.registerBot(new PapeRideBot(botUsername, botToken, website));
            System.out.println("✅ PapeRideBot is up and running!");
        } catch (TelegramApiException e) {
            System.err.println("Failed to start the bot: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
