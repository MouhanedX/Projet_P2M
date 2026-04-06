package com.telecom.nqms.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

@Slf4j
@Component
public class SessionAuthInterceptor implements HandlerInterceptor {

    public static final String SESSION_USER_KEY = "NQMS_AUTH_USER";
    private static final String INTERNAL_API_KEY_HEADER = "X-Internal-Api-Key";

    private final String internalApiKey;

    public SessionAuthInterceptor(@Value("${nqms.auth.internal-api-key:rtu-emulator-key}") String internalApiKey) {
        this.internalApiKey = internalApiKey;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        String requestUri = request.getRequestURI();
        String method = request.getMethod();

        if ("OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }

        if (!requestUri.startsWith("/api/")) {
            return true;
        }

        if (requestUri.startsWith("/api/auth/")) {
            return true;
        }

        String providedApiKey = request.getHeader(INTERNAL_API_KEY_HEADER);
        if (providedApiKey != null && !providedApiKey.isBlank() && providedApiKey.equals(internalApiKey)) {
            return true;
        }

        HttpSession session = request.getSession(false);
        Object authenticatedUser = session != null ? session.getAttribute(SESSION_USER_KEY) : null;
        if (authenticatedUser != null) {
            return true;
        }

        log.warn("Unauthorized request blocked: {} {}", method, requestUri);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"Unauthorized. Please log in.\"}");
        return false;
    }
}
