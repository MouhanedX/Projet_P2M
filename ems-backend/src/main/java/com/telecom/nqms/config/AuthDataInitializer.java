package com.telecom.nqms.config;

import com.telecom.nqms.model.UserAccount;
import com.telecom.nqms.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class AuthDataInitializer {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${nqms.auth.bootstrap-username:admin}")
    private String bootstrapUsername;

    @Value("${nqms.auth.bootstrap-password:admin123}")
    private String bootstrapPassword;

    @Value("${nqms.auth.bootstrap-role:ADMIN}")
    private String bootstrapRole;

    @Bean
    CommandLineRunner seedBootstrapAuthUser() {
        return args -> {
            if (isBlank(bootstrapUsername) || isBlank(bootstrapPassword)) {
                log.warn("Skipping bootstrap auth user: username/password is blank");
                return;
            }

            String normalizedUsername = bootstrapUsername.trim();
            if (userAccountRepository.findByUsernameIgnoreCase(normalizedUsername).isPresent()) {
                log.info("Bootstrap user '{}' already exists, keeping database credentials", normalizedUsername);
                return;
            }

            UserAccount account = UserAccount.builder()
                    .username(normalizedUsername)
                    .passwordHash(passwordEncoder.encode(bootstrapPassword))
                    .role(bootstrapRole)
                    .active(true)
                    .build();
            userAccountRepository.save(account);
            log.info("Created bootstrap user '{}' in users collection", normalizedUsername);
        };
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
