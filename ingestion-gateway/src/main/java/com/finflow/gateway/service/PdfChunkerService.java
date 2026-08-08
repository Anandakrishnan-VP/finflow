package com.finflow.gateway.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.multipdf.Splitter;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Service
public class PdfChunkerService {

    private static final int PAGES_PER_CHUNK = 10;
    private final RedisTaskProducer redisTaskProducer;

    public PdfChunkerService(RedisTaskProducer redisTaskProducer) {
        this.redisTaskProducer = redisTaskProducer;
    }

    public List<String> splitAndEnqueue(File pdfFile, String caseId, String statementId, String uploadDir) throws IOException {
        List<String> chunkPaths = new ArrayList<>();
        
        try (PDDocument document = Loader.loadPDF(pdfFile)) {
            int totalPages = document.getNumberOfPages();
            
            Splitter splitter = new Splitter();
            splitter.setSplitAtPage(PAGES_PER_CHUNK);
            List<PDDocument> splittedDocuments = splitter.split(document);

            Path chunkDir = Paths.get(uploadDir, "chunks", statementId);
            Files.createDirectories(chunkDir);

            for (int i = 0; i < splittedDocuments.size(); i++) {
                PDDocument chunkDoc = splittedDocuments.get(i);
                int startPage = (i * PAGES_PER_CHUNK) + 1;
                int endPage = Math.min((i + 1) * PAGES_PER_CHUNK, totalPages);

                File chunkFile = chunkDir.resolve("chunk_" + (i + 1) + ".pdf").toFile();
                chunkDoc.save(chunkFile);
                chunkDoc.close();

                chunkPaths.add(chunkFile.getAbsolutePath());

                // Enqueue 10-page micro-job to Redis
                Map<String, Object> jobPayload = new HashMap<>();
                jobPayload.put("case_id", caseId);
                jobPayload.put("statement_id", statementId);
                jobPayload.put("chunk_index", i + 1);
                jobPayload.put("total_chunks", splittedDocuments.size());
                jobPayload.put("start_page", startPage);
                jobPayload.put("end_page", endPage);
                jobPayload.put("chunk_file_path", chunkFile.getAbsolutePath());

                redisTaskProducer.pushChunkJob("finflow:pdf_chunks", jobPayload);
            }

            redisTaskProducer.updateProgress(statementId, 10, "Chunking complete: " + splittedDocuments.size() + " micro-jobs enqueued");
        }

        return chunkPaths;
    }
}
