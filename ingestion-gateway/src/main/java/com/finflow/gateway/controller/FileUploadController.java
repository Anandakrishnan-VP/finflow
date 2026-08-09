package com.finflow.gateway.controller;

import com.finflow.gateway.config.Bucket4jConfig;
import com.finflow.gateway.service.PdfChunkerService;
import com.finflow.gateway.service.RedisTaskProducer;
import io.github.bucket4j.Bucket;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/gateway")
public class FileUploadController {

    private final PdfChunkerService pdfChunkerService;
    private final RedisTaskProducer redisTaskProducer;
    private final Bucket4jConfig bucket4jConfig;

    @Value("${upload.dir:/data/uploads}")
    private String uploadDir;

    public FileUploadController(PdfChunkerService pdfChunkerService, 
                                RedisTaskProducer redisTaskProducer, 
                                Bucket4jConfig bucket4jConfig) {
        this.pdfChunkerService = pdfChunkerService;
        this.redisTaskProducer = redisTaskProducer;
        this.bucket4jConfig = bucket4jConfig;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadStatements(
            @RequestParam("case_id") String caseId,
            @RequestParam("files") List<MultipartFile> files,
            HttpServletRequest request) {

        String clientIp = request.getRemoteAddr();
        Bucket bucket = bucket4jConfig.resolveBucket(clientIp);

        if (!bucket.tryConsume(1)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "Rate limit exceeded. Maximum 50 requests per minute allowed."));
        }

        List<Map<String, Object>> responseList = new ArrayList<>();

        for (MultipartFile file : files) {
            String statementId = UUID.randomUUID().toString();
            String originalFilename = file.getOriginalFilename();

            try {
                Path destPath = Paths.get(uploadDir, statementId + "_" + originalFilename);
                Files.createDirectories(destPath.getParent());
                file.transferTo(destPath.toFile());

                File uploadedFile = destPath.toFile();

                if (originalFilename != null && originalFilename.toLowerCase().endsWith(".pdf")) {
                    // Process PDF asynchronously using Virtual Threads (Project Loom)
                    CompletableFuture.runAsync(() -> {
                        try {
                            pdfChunkerService.splitAndEnqueue(uploadedFile, caseId, statementId, uploadDir);
                        } catch (Exception e) {
                            redisTaskProducer.updateProgress(statementId, -1, "Chunking Failed: " + e.getMessage());
                        }
                    });
                } else {
                    // Non-PDF files (CSV, XLSX) enqueue directly as single micro-job
                    Map<String, Object> jobPayload = Map.of(
                            "case_id", caseId,
                            "statement_id", statementId,
                            "chunk_index", 1,
                            "total_chunks", 1,
                            "chunk_file_path", uploadedFile.getAbsolutePath()
                    );
                    redisTaskProducer.pushChunkJob("finflow:pdf_chunks", jobPayload);
                }

                responseList.add(Map.of(
                        "statement_id", statementId,
                        "filename", originalFilename,
                        "status", "QUEUED",
                        "case_id", caseId
                ));
            } catch (Exception e) {
                responseList.add(Map.of(
                        "filename", originalFilename,
                        "status", "FAILED",
                        "error", e.getMessage()
                ));
            }
        }

        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "processed_files", responseList.size(),
                "details", responseList
        ));
    }
}
