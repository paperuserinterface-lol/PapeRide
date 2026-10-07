package com.example.bot;

import java.util.Locale;

public enum BotLanguage {
    EN("en"),
    RU("ru"),
    UZ("uz");

    private final String code;

    BotLanguage(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static BotLanguage fromCode(String code) {
        if (code == null || code.isBlank()) {
            return EN;
        }
        String normalized = code.toLowerCase(Locale.ROOT);
        if (normalized.startsWith("ru")) {
            return RU;
        }
        if (normalized.startsWith("uz")) {
            return UZ;
        }
        return EN;
    }
}
