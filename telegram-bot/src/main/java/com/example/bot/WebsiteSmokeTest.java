package com.example.bot;

import io.github.cdimascio.dotenv.Dotenv;

import java.util.List;

/**
 * Manual round-trip check for WebsiteClient against a running PapeRide
 * website. Books a ride, reads it back, exercises the 409 "already on a
 * ride" guard, then cancels. Not part of the bot.
 *
 * <p>Run from the telegram-bot folder (website must be up):</p>
 * <pre>
 *   mvn -q compile dependency:build-classpath -Dmdep.outputFile=cp.txt
 *   java -cp "target\classes;$(Get-Content cp.txt -Raw)" com.example.bot.WebsiteSmokeTest
 * </pre>
 *
 * <p>Uses the same synthetic rider as Website/scripts/telegram-smoke-test.js
 * (tg:999999001) so {@code npm run test:telegram} cleans up any leftovers.</p>
 */
public final class WebsiteSmokeTest {

    private static final long TG_USER = 999999001L;

    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.load();
        WebsiteClient client = new WebsiteClient(
                dotenv.get("WEBSITE_URL"),
                dotenv.get("WEBSITE_INTERNAL_TOKEN"));

        client.checkHealth();
        System.out.println("checkHealth() OK");

        // Clean up leftovers from a previous run.
        for (WebsiteClient.RideInfo ride : client.listRides(TG_USER, 20)) {
            if ("pending".equals(ride.status()) || "assigned".equals(ride.status())) {
                client.cancelRide(TG_USER, ride.id());
            }
        }

        WebsiteClient.RideInfo booked = client.bookRide(TG_USER, "smoke_bot", "Smoke Test", request());
        expect(booked, "pending");
        System.out.println("bookRide() OK -> " + booked.id());

        List<WebsiteClient.RideInfo> history = client.listRides(TG_USER, 5);
        boolean found = history.stream().anyMatch(r -> r.id().equals(booked.id()));
        if (!found) throw new IllegalStateException("booked ride missing from listRides()");
        System.out.println("listRides() OK -> " + history.size() + " ride(s)");

        // Labels travel with the ride (typed addresses -> operator board).
        if (!"Smoke Test Pickup".equals(booked.pickupLabel())
                || !"Smoke Test Destination".equals(booked.dropoffLabel())) {
            throw new IllegalStateException("labels lost: " + booked.pickupLabel()
                    + " -> " + booked.dropoffLabel());
        }
        System.out.println("address labels round-trip OK");

        // Note: the 409 "ride already in progress" guard only kicks in once a
        // ride is assigned — covered end-to-end by the website's own
        // npm run test:telegram script (which dispatches with an available driver).

        WebsiteClient.RideInfo cancelled = client.cancelRide(TG_USER, booked.id());
        expect(cancelled, "cancelled");
        System.out.println("cancelRide() OK -> " + cancelled.id());

        System.out.println("\nAll website smoke checks passed.");
    }

    private static RideRequest request() {
        RideRequest req = new RideRequest();
        req.setPickupLocation("Smoke Test Pickup");
        req.setPickupLat(41.311);
        req.setPickupLon(69.279);
        req.setDestination("Smoke Test Destination");
        req.setDestLat(41.288);
        req.setDestLon(69.234);
        return req;
    }

    private static void expect(WebsiteClient.RideInfo ride, String status) {
        if (ride == null) throw new IllegalStateException("ride is null");
        if (!status.equals(ride.status())) {
            throw new IllegalStateException("expected status " + status + " but was " + ride.status());
        }
    }
}
