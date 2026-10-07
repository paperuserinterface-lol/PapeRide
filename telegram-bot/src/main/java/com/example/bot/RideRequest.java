package com.example.bot;

/**
 * Holds the data collected during a single ride-request conversation.
 */
public class RideRequest {

    private String pickupLocation;
    private String destination;
    private Double pickupLat;
    private Double pickupLon;
    private Double destLat;
    private Double destLon;

    // ── Pickup ────────────────────────────────────────────────

    public String getPickupLocation() {
        return pickupLocation;
    }

    public void setPickupLocation(String pickupLocation) {
        this.pickupLocation = pickupLocation;
    }

    public Double getPickupLat() {
        return pickupLat;
    }

    public void setPickupLat(Double pickupLat) {
        this.pickupLat = pickupLat;
    }

    public Double getPickupLon() {
        return pickupLon;
    }

    public void setPickupLon(Double pickupLon) {
        this.pickupLon = pickupLon;
    }

    // ── Destination ───────────────────────────────────────────

    public String getDestination() {
        return destination;
    }

    public void setDestination(String destination) {
        this.destination = destination;
    }

    public Double getDestLat() {
        return destLat;
    }

    public void setDestLat(Double destLat) {
        this.destLat = destLat;
    }

    public Double getDestLon() {
        return destLon;
    }

    public void setDestLon(Double destLon) {
        this.destLon = destLon;
    }

    // ── Display ───────────────────────────────────────────────

    /**
     * Both pickup and destination have a point on the map. The website
     * dispatch board is a map — coordinates are mandatory to dispatch.
     */
    public boolean hasCoordinates() {
        return pickupLat != null && pickupLon != null
                && destLat != null && destLon != null;
    }

    public String getPickupDisplay() {
        if (pickupLat != null && pickupLon != null) {
            return pickupLocation != null
                    ? pickupLocation + " (📍 " + pickupLat + ", " + pickupLon + ")"
                    : "📍 " + pickupLat + ", " + pickupLon;
        }
        return pickupLocation;
    }

    public String getDestinationDisplay() {
        if (destLat != null && destLon != null) {
            return destination != null
                    ? destination + " (📍 " + destLat + ", " + destLon + ")"
                    : "📍 " + destLat + ", " + destLon;
        }
        return destination;
    }

    @Override
    public String toString() {
        return "RideRequest{pickup=" + getPickupDisplay() + ", dest=" + getDestinationDisplay() + "}";
    }
}
