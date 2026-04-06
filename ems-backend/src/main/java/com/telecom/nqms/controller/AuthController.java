package com.telecom.nqms.controller;

import com.telecom.nqms.config.SessionAuthInterceptor;
import com.telecom.nqms.model.UserAccount;
import com.telecom.nqms.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthStatusResponse> login(
            @RequestBody(required = false) LoginRequest request,
            HttpServletRequest httpRequest
    ) {
        if (request == null || isBlank(request.username()) || isBlank(request.password())) {
            return ResponseEntity.badRequest().body(new AuthStatusResponse(false, null, "Username and password are required"));
        }

        Optional<UserAccount> authenticatedUser = authService.authenticate(request.username(), request.password());
        if (authenticatedUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthStatusResponse(false, null, "Invalid username or password"));
        }

        String username = authenticatedUser.get().getUsername();

        HttpSession session = httpRequest.getSession(true);
        session.setAttribute(SessionAuthInterceptor.SESSION_USER_KEY, username);

        return ResponseEntity.ok(new AuthStatusResponse(true, username, "Login successful"));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthStatusResponse> me(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        Object username = session != null ? session.getAttribute(SessionAuthInterceptor.SESSION_USER_KEY) : null;

        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthStatusResponse(false, null, "No active session"));
        }

        return ResponseEntity.ok(new AuthStatusResponse(true, username.toString(), "Session active"));
    }

    @PostMapping("/logout")
    public ResponseEntity<AuthStatusResponse> logout(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        return ResponseEntity.ok(new AuthStatusResponse(false, null, "Logged out"));
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    public record LoginRequest(String username, String password) {
    }

    public record AuthStatusResponse(boolean authenticated, String username, String message) {
    }
}
