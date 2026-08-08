package com.finflow.gateway.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
public class Bucket4jConfig {
    private final Map<String, Bucket> cache = new ConcurrentHashMap<>();

    public Bucket resolveBucket(String ip) {
        return cache.computeIfAbsent(ip, this::createNewBucket);
    }

    private Bucket createNewBucket(String key) {
        Refill refill = Refill.greedy(50, Duration.ofMinutes(1));
        Bandwidth limit = Bandwidth.classic(50, refill);
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }
}
