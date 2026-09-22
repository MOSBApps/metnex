package com.metnex.jasperrenderer.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Unauthenticated liveness/readiness probe — used by the container HEALTHCHECK and orchestrator. */
@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "service", "jasper-renderer");
    }
}
