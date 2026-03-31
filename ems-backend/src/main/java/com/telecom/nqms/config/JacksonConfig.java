package com.telecom.nqms.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.regex.Pattern;

/**
 * Customize Jackson time handling so EMS can parse Python timestamps and
 * serialize Instants as ISO-8601 strings for frontend compatibility.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> {
            SimpleModule module = new SimpleModule();
            module.addDeserializer(Instant.class, new FlexibleInstantDeserializer());

            builder.modules(new JavaTimeModule(), module);
            builder.featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        };
    }

    static class FlexibleInstantDeserializer extends JsonDeserializer<Instant> {
        private static final Pattern OFFSET_PATTERN = Pattern.compile(".*([zZ]|[+-]\\d{2}:\\d{2})$");

        @Override
        public Instant deserialize(JsonParser parser, DeserializationContext ctxt) throws IOException {
            JsonToken token = parser.currentToken();

            if (token == JsonToken.VALUE_NULL) {
                return null;
            }

            if (token == JsonToken.VALUE_NUMBER_INT || token == JsonToken.VALUE_NUMBER_FLOAT) {
                BigDecimal numeric = parser.getDecimalValue();

                if (numeric.abs().compareTo(BigDecimal.valueOf(100_000_000_000L)) >= 0) {
                    return Instant.ofEpochMilli(numeric.longValue());
                }

                long seconds = numeric.longValue();
                BigDecimal fractional = numeric.subtract(BigDecimal.valueOf(seconds)).abs();
                int nanos = fractional.movePointRight(9).intValue();
                return Instant.ofEpochSecond(seconds, nanos);
            }

            String raw = parser.getValueAsString();
            if (raw == null || raw.isBlank()) {
                return null;
            }

            String value = raw.trim();

            try {
                return Instant.parse(ensureOffset(value));
            } catch (Exception firstError) {
                try {
                    LocalDateTime dateTime = LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                    return dateTime.toInstant(ZoneOffset.UTC);
                } catch (Exception secondError) {
                    throw new IOException("Unable to parse Instant: " + value, secondError);
                }
            }
        }

        private String ensureOffset(String value) {
            if (OFFSET_PATTERN.matcher(value).matches()) {
                return value;
            }
            return value + "Z";
        }
    }
}