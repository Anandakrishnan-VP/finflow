package com.finflow.gateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class RedisTaskProducer {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public RedisTaskProducer(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public void pushChunkJob(String queueName, Map<String, Object> jobPayload) {
        try {
            String jsonStr = objectMapper.writeValueAsString(jobPayload);
            redisTemplate.opsForList().rightPush(queueName, jsonStr);
        } catch (Exception e) {
            throw new RuntimeException("Failed to push chunk job to Redis: " + e.getMessage(), e);
        }
    }

    public void updateProgress(String taskId, int progressPercentage, String stage) {
        try {
            String key = "finflow:progress:" + taskId;
            Map<String, String> progressMap = Map.of(
                "progress", String.valueOf(progressPercentage),
                "stage", stage
            );
            redisTemplate.opsForHash().putAll(key, progressMap);
            redisTemplate.convertAndSend("finflow:progress_channel", objectMapper.writeValueAsString(Map.of(
                "task_id", taskId,
                "progress", progressPercentage,
                "stage", stage
            )));
        } catch (Exception ignored) {}
    }
}
