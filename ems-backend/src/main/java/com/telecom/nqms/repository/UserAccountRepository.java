package com.telecom.nqms.repository;

import com.telecom.nqms.model.UserAccount;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserAccountRepository extends MongoRepository<UserAccount, String> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);
}
