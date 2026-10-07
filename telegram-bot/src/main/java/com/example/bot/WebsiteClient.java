package com.example.bot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * HTTP client for the PapeRide Website (the shared TBRide backend).
 *
 * <p>The website is the single source of truth for rides: everything the bot
 * books lands in the same PostgreSQL database the operator dispatch board and
 * the driver app read, and every status change made on the website is read
 * back by the bot's poller and forwarded to the rider in Telegram.</p>
 *
 * <p>Endpoints used (all guarded by the X-Telegram-Token shared secret):</p>
 * <pre>
 *   GET  /api/health
 *   POST /api/telegram/rides
 *   GET  /api/telegram/rides?telegram_user_id=&amp;limit=
 *   POST /api/telegram/rides/{id}/cancel
 * </pre>
 */
public class WebsiteClient {

    /** Raised for any non-2xx answer; carries the website's public message. */
    public static class ApiException extends Exception {
        private final int statusCode;

        public ApiException(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }

        public int getStatusCode() {
            return statusCode;
        }

        /** 409 = the rider already has a ride being served. */
        public boolean isConflict() {
            return statusCode == 409;
        }
    }

    /** The subset of a serialised ride the bot needs for chat + notifications. */
    public record RideInfo(
            String id,
            String status,
            String pickupLabel,
            String dropoffLabel,
            String driverName,
            String driverPhone,
            String vehicleModel,
            String licensePlate,
            double fare,
            double distanceKm,
            Instant createdAt) {
    }

    private final String baseUrl;
    private final String token;
    private final HttpClient http;
    private final ObjectMapper json;

    public WebsiteClient(String baseUrl, String token) {
        String normalised = baseUrl == null ? "" : baseUrl.trim();
        while (normalised.endsWith("/")) {
            normalised = normalised.substring(0, normalised.length() - 1);
        }
        this.baseUrl = normalised;
        this.token = token;
        // Force HTTP/1.1: the JDK's default h2c upgrade attempt makes Node's
        // `upgrade` handler (Socket.IO) drop the socket before any response.
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.json = new ObjectMapper();
    }

    /** Boot-time check: the website answers and reports a healthy database. */
    public void checkHealth() throws Exception {
        JsonNode body = request("GET", "/api/health", null);
        if (!body.path("ok").asBoolean(false)) {
            throw new ApiException(503, "website reports an unhealthy state");
        }
    }

    /**
     * Book a ride through the website. Coordinates are mandatory — the
     * dispatch board is a map, an address without a point cannot be served.
     *
     * @return the created ride (status "pending")
     */
    public RideInfo bookRide(long telegramUserId, String username, String firstName,
                             RideRequest request) throws Exception {
        if (!request.hasCoordinates()) {
            throw new IllegalArgumentException("pickup and destination coordinates are required");
        }

        ObjectNode payload = json.createObjectNode();
        payload.put("telegram_user_id", telegramUserId);
        if (username != null && !username.isBlank()) payload.put("username", username);
        if (firstName != null && !firstName.isBlank()) payload.put("first_name", firstName);
        payload.put("pickup_lat", request.getPickupLat());
        payload.put("pickup_lng", request.getPickupLon());
        payload.put("dropoff_lat", request.getDestLat());
        payload.put("dropoff_lng", request.getDestLon());
        if (request.getPickupLocation() != null) {
            payload.put("pickup_label", request.getPickupLocation());
        }
        if (request.getDestination() != null) {
            payload.put("dropoff_label", request.getDestination());
        }

        JsonNode body = request("POST", "/api/telegram/rides", payload);
        return parseRide(body.path("ride"));
    }

    /** Latest rides of one Telegram rider, newest first. */
    public List<RideInfo> listRides(long telegramUserId, int limit) throws Exception {
        JsonNode body = request("GET",
                "/api/telegram/rides?telegram_user_id=" + telegramUserId + "&limit=" + limit,
                null);
        List<RideInfo> rides = new ArrayList<>();
        for (JsonNode node : body.path("rides")) {
            RideInfo ride = parseRide(node);
            if (ride != null) rides.add(ride);
        }
        return rides;
    }

    /** Cancel one of the rider's own cancellable rides (pending / assigned). */
    public RideInfo cancelRide(long telegramUserId, String rideId) throws Exception {
        ObjectNode payload = json.createObjectNode();
        payload.put("telegram_user_id", telegramUserId);
        JsonNode body = request("POST", "/api/telegram/rides/" + rideId + "/cancel", payload);
        return parseRide(body.path("ride"));
    }

    // -----------------------------------------------------------------------
    //  plumbing
    // -----------------------------------------------------------------------

    private JsonNode request(String method, String path, JsonNode body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(10))
                .header("X-Telegram-Token", token)
                .header("Accept", "application/json");
        if (body != null) {
            builder.header("Content-Type", "application/json")
                   .method(method, HttpRequest.BodyPublishers.ofString(body.toString()));
        } else {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        }

        HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return json.readTree(response.body());
        }
        String message = extractErrorMessage(response.body());
        throw new ApiException(status, message != null ? message : "HTTP " + status);
    }

    /** The website's public error shape: {"error":{"code","message"}}. */
    private String extractErrorMessage(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            JsonNode message = json.readTree(raw).path("error").path("message");
            return message.isTextual() && !message.asText().isBlank() ? message.asText() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private RideInfo parseRide(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        JsonNode quote = node.path("quote");
        return new RideInfo(
                text(node, "id"),
                node.path("status").isTextual() ? node.path("status").asText() : "pending",
                text(node, "pickupLabel"),
                text(node, "dropoffLabel"),
                text(node, "driverName"),
                text(node, "driverPhone"),
                text(node, "vehicleModel"),
                text(node, "licensePlate"),
                quote.path("fare").asDouble(0),
                quote.path("distanceKm").asDouble(0),
                instant(text(node, "createdAt")));
    }

    /** Textual field or null — never the literal strings "null"/"undefined". */
    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.asText() : null;
    }

    private Instant instant(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try {
            return Instant.parse(iso);
        } catch (Exception ignored) {
            return null;
        }
    }
}
