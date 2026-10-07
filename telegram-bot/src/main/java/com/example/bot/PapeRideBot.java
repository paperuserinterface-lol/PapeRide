package com.example.bot;

import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Location;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboardRemove;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardButton;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardRow;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * PapeRideBot — a ride-request Telegram bot.
 *
 * Flow:
 *   1. User sends /request
 *   2. Bot asks for pickup location (text or 📍 share-location button)
 *   3. Bot asks for destination
 *   4. Bot shows a summary and Confirm / Cancel inline buttons
 *   5. User confirms → ride is booked; or cancels → flow resets
 *
 * Confirmed rides are booked through the PapeRide Website API
 * (/api/telegram/rides), so they land on the operator dispatch board in real
 * time. A background poller watches every tracked ride's status and pushes
 * Telegram notifications whenever the website assigns a driver, starts,
 * completes or cancels the ride. /rides reads live status back the same way.
 */
public class PapeRideBot extends TelegramLongPollingBot {

    private final String botUsername;
    private final String botToken;

    /** Per-chat conversation state. */
    private final Map<Long, ConversationState> chatStates = new ConcurrentHashMap<>();

    /** Per-chat in-progress ride request data. */
    private final Map<Long, RideRequest> chatRequests = new ConcurrentHashMap<>();

    /** Per-chat language preference. */
    private final Map<Long, BotLanguage> chatLanguages = new ConcurrentHashMap<>();

    /** Website (shared TBRide backend) — the single source of truth. */
    private final WebsiteClient website;

    /** Telegram user ids whose rides this process pushes updates for. */
    private final Set<Long> trackedRiders = ConcurrentHashMap.newKeySet();

    /** telegram user id -> chat to notify (group bookings notify the group). */
    private final Map<Long, Long> notifyChatByRider = new ConcurrentHashMap<>();

    /** ride id -> last status seen by the poller (dedup for notifications). */
    private final Map<String, String> lastKnownStatus = new ConcurrentHashMap<>();

    /** Ride status polling against the website (daemon thread). */
    private final ScheduledExecutorService statusPoller = Executors.newSingleThreadScheduledExecutor(
            runnable -> {
                Thread thread = new Thread(runnable, "ride-status-poller");
                thread.setDaemon(true);
                return thread;
            });

    /** Timestamp format used by the /rides command. */
    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm").withZone(ZoneId.systemDefault());

    /** How often the bot asks the website for ride status changes. */
    private static final long POLL_INTERVAL_SECONDS = 10;

    public PapeRideBot(String botUsername, String botToken, WebsiteClient website) {
        this.botUsername = botUsername;
        this.botToken = botToken;
        this.website = website;
        statusPoller.scheduleWithFixedDelay(this::pollRideStatuses,
                POLL_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS, TimeUnit.SECONDS);
    }

    @Override
    public String getBotUsername() {
        return botUsername;
    }

    @Override
    public String getBotToken() {
        return botToken;
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE DISPATCHER
    // ═══════════════════════════════════════════════════════════

    @Override
    public void onUpdateReceived(Update update) {
        // Handle inline-keyboard button presses (Confirm / Cancel)
        if (update.hasCallbackQuery()) {
            handleCallback(update.getCallbackQuery());
            return;
        }

        if (!update.hasMessage()) {
            return;
        }

        Message msg = update.getMessage();
        long chatId = msg.getChatId();
        if (msg.getFrom() != null) {
            chatLanguages.computeIfAbsent(chatId,
                    ignored -> BotLanguage.fromCode(msg.getFrom().getLanguageCode()));
        }
        ConversationState state = chatStates.getOrDefault(chatId, ConversationState.IDLE);

        // ── Commands (always available) ──────────────────────
        if (msg.hasText()) {
            String text = msg.getText().trim();

            if (text.startsWith("/start")) {
                handleStart(chatId, msg.getFrom().getFirstName());
                return;
            }
            if (text.startsWith("/help")) {
                handleHelp(chatId);
                return;
            }
            if (text.startsWith("/language")) {
                handleLanguage(chatId);
                return;
            }
            if (text.startsWith("/request")) {
                startRideRequest(chatId);
                return;
            }
            if (text.startsWith("/cancel")) {
                cancelRide(chatId, msg.getFrom().getId());
                return;
            }
            if (text.startsWith("/rides")) {
                handleMyRides(chatId, msg.getFrom().getId());
                return;
            }
        }

        // ── Conversation flow ────────────────────────────────
        switch (state) {
            case WAITING_FOR_PICKUP   -> handlePickupReply(chatId, msg);
            case WAITING_FOR_DESTINATION -> handleDestinationReply(chatId, msg);
            case WAITING_FOR_CONFIRMATION -> send(chatId, text(chatId, BotText.USE_BUTTONS));
            default -> {
                // Not in a flow — nudge them
                if (msg.hasText()) {
                    send(chatId, text(chatId, BotText.NUDGE));
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  COMMAND HANDLERS
    // ═══════════════════════════════════════════════════════════

    private void handleStart(long chatId, String firstName) {
        send(chatId, text(chatId, BotText.WELCOME, firstName == null ? "" : firstName));
    }

    private void handleHelp(long chatId) {
        send(chatId, text(chatId, BotText.HELP));
    }

    private void handleLanguage(long chatId) {
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();
        for (BotLanguage language : BotLanguage.values()) {
            String label = switch (language) {
                case EN -> "English";
                case RU -> "Русский";
                case UZ -> "O'zbekcha";
            };
            InlineKeyboardButton button = new InlineKeyboardButton(label);
            button.setCallbackData("language:" + language.getCode());
            rows.add(List.of(button));
        }
        markup.setKeyboard(rows);

        SendMessage message = new SendMessage();
        message.setChatId(String.valueOf(chatId));
        message.setText(text(chatId, BotText.LANGUAGE_PROMPT));
        message.setReplyMarkup(markup);
        executeSafe(message);
    }

    /** /rides — live ride history straight from the PapeRide website. */
    private void handleMyRides(long chatId, long telegramUserId) {
        List<WebsiteClient.RideInfo> history;
        try {
            history = website.listRides(telegramUserId, 5);
        } catch (Exception e) {
            System.err.println("Failed to load ride history: " + e.getMessage());
            send(chatId, text(chatId, BotText.HISTORY_FAILED));
            return;
        }

        // Future status changes for this rider should be pushed to this chat.
        trackRider(telegramUserId, chatId);

        if (history.isEmpty()) {
            send(chatId, text(chatId, BotText.HISTORY_EMPTY));
            return;
        }

        // Sent without Markdown: addresses may contain characters that
        // Telegram's Markdown parser would reject.
        StringBuilder sb = new StringBuilder(text(chatId, BotText.HISTORY_TITLE)).append('\n');
        for (WebsiteClient.RideInfo r : history) {
            sb.append(String.format("\n#%s · %s\n🟢 %s\n🔴 %s\n🕐 %s\n",
                    shortId(r.id()),
                    rideStatusText(chatId, r.status()),
                    r.pickupLabel() == null ? "—" : r.pickupLabel(),
                    r.dropoffLabel() == null ? "—" : r.dropoffLabel(),
                    r.createdAt() == null ? "—" : TIME_FMT.format(r.createdAt())));
        }
        sendPlain(chatId, sb.toString().trim());
    }

    // ═══════════════════════════════════════════════════════════
    //  RIDE REQUEST FLOW
    // ═══════════════════════════════════════════════════════════

    /** Reply keyboard with the 📍 Share my location button. */
    private ReplyKeyboardMarkup locationKeyboard(long chatId) {
        KeyboardButton locationBtn = new KeyboardButton(text(chatId, BotText.SHARE_LOCATION));
        locationBtn.setRequestLocation(true);

        KeyboardRow row = new KeyboardRow();
        row.add(locationBtn);

        ReplyKeyboardMarkup keyboard = new ReplyKeyboardMarkup();
        keyboard.setKeyboard(List.of(row));
        keyboard.setResizeKeyboard(true);
        keyboard.setOneTimeKeyboard(true);
        return keyboard;
    }

    /** Step 1 — ask for pickup location. */
    private void startRideRequest(long chatId) {
        chatRequests.put(chatId, new RideRequest());
        chatStates.put(chatId, ConversationState.WAITING_FOR_PICKUP);

        SendMessage message = new SendMessage();
        message.setChatId(String.valueOf(chatId));
        message.setText(text(chatId, BotText.PROMPT_PICKUP));
        message.enableMarkdown(true);
        message.setReplyMarkup(locationKeyboard(chatId));
        executeSafe(message);
    }

    /** Step 2 — receive pickup, ask for destination. */
    private void handlePickupReply(long chatId, Message msg) {
        RideRequest req = chatRequests.get(chatId);
        if (req == null) { resetConversation(chatId); return; }

        if (msg.hasLocation()) {
            Location loc = msg.getLocation();
            req.setPickupLat(loc.getLatitude());
            req.setPickupLon(loc.getLongitude());
            if (req.getPickupLocation() == null || req.getPickupLocation().isBlank()) {
                req.setPickupLocation(text(chatId, BotText.SHARED_LOCATION));
            }
        } else if (msg.hasText()) {
            // Keep the typed address as the label; the dispatch board is a
            // map, so we still need the exact point on it.
            String typed = msg.getText().trim();
            req.setPickupLocation(typed);
            SendMessage note = new SendMessage();
            note.setChatId(String.valueOf(chatId));
            note.setText(text(chatId, BotText.PICKUP_NOTED, typed));
            note.setReplyMarkup(locationKeyboard(chatId));
            executeSafe(note);
            return;
        } else {
            send(chatId, text(chatId, BotText.LOCATION_OR_ADDRESS));
            return;
        }

        chatStates.put(chatId, ConversationState.WAITING_FOR_DESTINATION);

        // Remove the custom keyboard and ask for destination
        SendMessage message = new SendMessage();
        message.setChatId(String.valueOf(chatId));
        message.setText(text(chatId, BotText.PROMPT_DESTINATION));
        message.enableMarkdown(true);
        message.setReplyMarkup(new ReplyKeyboardRemove(true));
        executeSafe(message);
    }

    /** Step 3 — receive destination, show summary & confirm / cancel. */
    private void handleDestinationReply(long chatId, Message msg) {
        RideRequest req = chatRequests.get(chatId);
        if (req == null) { resetConversation(chatId); return; }

        if (msg.hasLocation()) {
            Location loc = msg.getLocation();
            req.setDestLat(loc.getLatitude());
            req.setDestLon(loc.getLongitude());
            if (req.getDestination() == null || req.getDestination().isBlank()) {
                req.setDestination(text(chatId, BotText.SHARED_LOCATION));
            }
        } else if (msg.hasText()) {
            // Keep the typed address as the label; still need the point.
            String typed = msg.getText().trim();
            req.setDestination(typed);
            SendMessage note = new SendMessage();
            note.setChatId(String.valueOf(chatId));
            note.setText(text(chatId, BotText.DESTINATION_NOTED, typed));
            note.setReplyMarkup(locationKeyboard(chatId));
            executeSafe(note);
            return;
        } else {
            send(chatId, text(chatId, BotText.LOCATION_OR_ADDRESS));
            return;
        }

        chatStates.put(chatId, ConversationState.WAITING_FOR_CONFIRMATION);

        // Build summary
        String summary = text(chatId, BotText.RIDE_SUMMARY,
                req.getPickupDisplay(), req.getDestinationDisplay());

        // Confirm / Cancel inline buttons
        InlineKeyboardButton confirmBtn = new InlineKeyboardButton(text(chatId, BotText.CONFIRM));
        confirmBtn.setCallbackData("ride_confirm");

        InlineKeyboardButton cancelBtn = new InlineKeyboardButton(text(chatId, BotText.CANCEL));
        cancelBtn.setCallbackData("ride_cancel");

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<InlineKeyboardButton> row = new ArrayList<>();
        row.add(confirmBtn);
        row.add(cancelBtn);
        markup.setKeyboard(List.of(row));

        SendMessage message = new SendMessage();
        message.setChatId(String.valueOf(chatId));
        message.setText(summary);
        message.enableMarkdown(true);
        message.setReplyMarkup(markup);
        executeSafe(message);
    }

    /** Step 4 — handle Confirm / Cancel button press. */
    private void handleCallback(CallbackQuery cb) {
        long chatId = cb.getMessage().getChatId();
        int messageId = cb.getMessage().getMessageId();
        String data = cb.getData();

        if (data != null && data.startsWith("language:")) {
            BotLanguage selected = BotLanguage.fromCode(data.substring("language:".length()));
            chatLanguages.put(chatId, selected);
            answerAndEdit(chatId, messageId, text(chatId, BotText.LANGUAGE_CHANGED));
            return;
        }

        RideRequest req = chatRequests.get(chatId);

        if ("ride_confirm".equals(data)) {
            if (req == null) {
                answerAndEdit(chatId, messageId, text(chatId, BotText.NO_ACTIVE_REQUEST));
            } else if (!req.hasCoordinates()) {
                answerAndEdit(chatId, messageId, text(chatId, BotText.NEED_BOTH_LOCATIONS));
                resetConversation(chatId);
                return;
            } else {
                // Book through the website first, so a failed call can never
                // produce a fake "booked" message.
                WebsiteClient.RideInfo ride;
                try {
                    ride = website.bookRide(
                            cb.getFrom().getId(),
                            cb.getFrom().getUserName(),
                            cb.getFrom().getFirstName(),
                            req);
                } catch (WebsiteClient.ApiException e) {
                    System.err.println("Website rejected the booking: HTTP "
                            + e.getStatusCode() + " " + e.getMessage());
                    answerAndEditPlain(chatId, messageId, text(chatId,
                            e.isConflict() ? BotText.RIDE_CONFLICT : BotText.BOOK_FAILED));
                    resetConversation(chatId);
                    return;
                } catch (Exception e) {
                    System.err.println("Failed to reach the website: " + e.getMessage());
                    answerAndEditPlain(chatId, messageId, text(chatId, BotText.SERVICE_UNAVAILABLE));
                    resetConversation(chatId);
                    return;
                }

                trackRider(cb.getFrom().getId(), chatId);
                lastKnownStatus.put(ride.id(), ride.status());

                // Edited without Markdown: typed addresses may contain
                // characters Telegram's parser rejects.
                String confirmation = text(chatId, BotText.RIDE_CONFIRMED,
                        shortId(ride.id()),
                        text(chatId, BotText.PICKUP), req.getPickupDisplay(),
                        text(chatId, BotText.DESTINATION), req.getDestinationDisplay());

                answerAndEditPlain(chatId, messageId, confirmation);
                System.out.println("[RIDE BOOKED] id=" + ride.id() + " chat=" + chatId + " " + req);
            }
            resetConversation(chatId);

        } else if ("ride_cancel".equals(data)) {
            answerAndEdit(chatId, messageId, text(chatId, BotText.RIDE_CANCELLED_BUTTON));
            resetConversation(chatId);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * /cancel — aborts the in-flight booking conversation, or (when idle)
     * cancels the rider's newest live ride on the website.
     */
    private void cancelRide(long chatId, Long telegramUserId) {
        boolean inConversation = chatStates.containsKey(chatId);
        resetConversation(chatId);
        if (inConversation) {
            send(chatId, text(chatId, BotText.CANCELLED_REQUEST));
            return;
        }
        if (telegramUserId == null) {
            send(chatId, text(chatId, BotText.NO_REQUEST));
            return;
        }

        try {
            WebsiteClient.RideInfo target = website.listRides(telegramUserId, 5).stream()
                    .filter(r -> "pending".equals(r.status()) || "assigned".equals(r.status()))
                    .findFirst()
                    .orElse(null);
            if (target == null) {
                send(chatId, text(chatId, BotText.NO_ACTIVE_RIDE));
                return;
            }
            website.cancelRide(telegramUserId, target.id());
            // Tell the poller first so it never broadcasts our own cancellation.
            lastKnownStatus.put(target.id(), "cancelled");
            trackRider(telegramUserId, chatId);
            sendPlain(chatId, text(chatId, BotText.CANCELLED_RIDE_ID, shortId(target.id())));
        } catch (Exception e) {
            System.err.println("Failed to cancel ride: " + e.getMessage());
            send(chatId, text(chatId, BotText.CANCEL_FAILED));
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  WEBSITE STATUS POLLING
    // ═══════════════════════════════════════════════════════════

    /** Remember where to reach a rider and that their rides matter to us. */
    private void trackRider(long telegramUserId, long chatId) {
        trackedRiders.add(telegramUserId);
        notifyChatByRider.put(telegramUserId, chatId);
    }

    /** First characters of a UUID — how booking ids are shown in chat. */
    private String shortId(String id) {
        return id == null ? "?" : (id.length() > 8 ? id.substring(0, 8) : id);
    }

    /**
     * One poll cycle: fetch every tracked rider's rides and message the chat
     * whenever a status changed. First sight of an already-finished ride is
     * silent — history must never be replayed after a restart.
     */
    private void pollRideStatuses() {
        for (long telegramUserId : trackedRiders) {
            List<WebsiteClient.RideInfo> rides;
            try {
                rides = website.listRides(telegramUserId, 10);
            } catch (Exception e) {
                System.err.println("[poller] website unreachable: " + e.getMessage());
                continue;
            }

            long chatId = notifyChatByRider.getOrDefault(telegramUserId, telegramUserId);
            for (WebsiteClient.RideInfo ride : rides) {
                String previous = lastKnownStatus.get(ride.id());
                if (ride.status().equals(previous)) {
                    continue;
                }
                boolean firstSight = previous == null;
                lastKnownStatus.put(ride.id(), ride.status());
                boolean stillWorking = "assigned".equals(ride.status())
                        || "in_progress".equals(ride.status());
                if (firstSight && !stillWorking) {
                    continue;
                }
                String text = statusNotification(chatId, ride);
                if (text != null) {
                    sendPlain(chatId, text);
                }
            }
        }
    }

    /** Chat text for a status change; null means "stay quiet". */
    private String statusNotification(long chatId, WebsiteClient.RideInfo ride) {
        String header = " (" + text(chatId, BotText.BOOKING, shortId(ride.id())) + ")";
        switch (ride.status()) {
            case "assigned" -> {
                StringBuilder sb = new StringBuilder();
                sb.append(text(chatId, BotText.RIDE_DRIVER_FOUND)).append(header).append('\n');
                sb.append("👤 ").append(ride.driverName() == null
                        ? text(chatId, BotText.YOUR_DRIVER) : ride.driverName()).append('\n');
                String vehicle = (ride.vehicleModel() == null ? "" : ride.vehicleModel())
                        + (ride.licensePlate() == null ? "" : " · " + ride.licensePlate());
                if (!vehicle.isBlank()) {
                    sb.append("🚗 ").append(vehicle.trim()).append('\n');
                }
                if (ride.driverPhone() != null) {
                    sb.append("📞 ").append(ride.driverPhone()).append('\n');
                }
                if (ride.fare() > 0) {
                    sb.append("💰 ").append(Math.round(ride.fare())).append(" UZS");
                    if (ride.distanceKm() > 0) {
                        sb.append(" · ").append(text(chatId, BotText.KM, ride.distanceKm()));
                    }
                    sb.append('\n');
                }
                sb.append(text(chatId, BotText.DRIVER_ON_WAY));
                return sb.toString();
            }
            case "in_progress" -> {
                return text(chatId, BotText.RIDE_STARTED) + header;
            }
            case "completed" -> {
                return text(chatId, BotText.RIDE_COMPLETED) + header + "\n"
                        + text(chatId, BotText.THANKS_FOR_RIDING);
            }
            case "cancelled" -> {
                return text(chatId, BotText.RIDE_CANCELLED_STATUS) + header + "\n"
                        + text(chatId, BotText.REQUEST_AGAIN);
            }
            default -> {
                return null;
            }
        }
    }

    private void resetConversation(long chatId) {
        chatStates.remove(chatId);
        chatRequests.remove(chatId);
    }

    private String text(long chatId, BotText message, Object... args) {
        return message.format(chatLanguages.getOrDefault(chatId, BotLanguage.EN), args);
    }

    private String rideStatusText(long chatId, String status) {
        BotLanguage language = chatLanguages.getOrDefault(chatId, BotLanguage.EN);
        return switch (status) {
            case "pending" -> switch (language) {
                case RU -> "ожидает";
                case UZ -> "kutilmoqda";
                case EN -> "pending";
            };
            case "assigned" -> switch (language) {
                case RU -> "назначен водитель";
                case UZ -> "haydovchi tayinlandi";
                case EN -> "driver assigned";
            };
            case "in_progress" -> switch (language) {
                case RU -> "в пути";
                case UZ -> "yo'lda";
                case EN -> "in progress";
            };
            case "completed" -> switch (language) {
                case RU -> "завершена";
                case UZ -> "yakunlandi";
                case EN -> "completed";
            };
            case "cancelled" -> switch (language) {
                case RU -> "отменена";
                case UZ -> "bekor qilindi";
                case EN -> "cancelled";
            };
            default -> status;
        };
    }

    /** Send a plain markdown message. */
    private void send(long chatId, String text) {
        SendMessage msg = new SendMessage();
        msg.setChatId(String.valueOf(chatId));
        msg.setText(text);
        msg.enableMarkdown(true);
        executeSafe(msg);
    }

    /** Send a message with no entity parsing (safe for arbitrary user text). */
    private void sendPlain(long chatId, String text) {
        SendMessage msg = new SendMessage();
        msg.setChatId(String.valueOf(chatId));
        msg.setText(text);
        executeSafe(msg);
    }

    /** Edit an existing message (used after inline-button press). */
    private void answerAndEdit(long chatId, int messageId, String newText) {
        EditMessageText edit = new EditMessageText();
        edit.setChatId(String.valueOf(chatId));
        edit.setMessageId(messageId);
        edit.setText(newText);
        edit.enableMarkdown(true);
        try {
            execute(edit);
        } catch (TelegramApiException e) {
            System.err.println("Failed to edit message: " + e.getMessage());
        }
    }

    /** Edit an existing message with no entity parsing (safe for user text). */
    private void answerAndEditPlain(long chatId, int messageId, String newText) {
        EditMessageText edit = new EditMessageText();
        edit.setChatId(String.valueOf(chatId));
        edit.setMessageId(messageId);
        edit.setText(newText);
        try {
            execute(edit);
        } catch (TelegramApiException e) {
            System.err.println("Failed to edit message: " + e.getMessage());
        }
    }

    private void executeSafe(SendMessage msg) {
        try {
            execute(msg);
        } catch (TelegramApiException e) {
            System.err.println("Failed to send message: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
