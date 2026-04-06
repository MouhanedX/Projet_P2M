package com.telecom.nqms.service;

import com.telecom.nqms.model.UserAccount;
import com.telecom.nqms.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;

    public Optional<UserAccount> authenticate(String username, String password) {
        if (isBlank(username) || isBlank(password)) {
            return Optional.empty();
        }

        String normalizedUsername = username.trim();
        return userAccountRepository.findByUsernameIgnoreCase(normalizedUsername)
                .filter(user -> Boolean.TRUE.equals(user.getActive()))
                .filter(user -> user.getPasswordHash() != null && passwordEncoder.matches(password, user.getPasswordHash()));
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
