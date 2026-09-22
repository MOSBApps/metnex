package com.metnex.jasperrenderer.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.metnex.jasperrenderer.web.dto.ErrorResponse;
import com.metnex.jasperrenderer.web.dto.RenderRequest;
import com.metnex.jasperrenderer.web.dto.RenderRow;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Separate Spring context with renderer.timeout-ms set to an unrealistically low value so the
 * Future.get(timeout) path in JasperRenderService is exercised deterministically — a real render
 * of one row will always exceed a 1ms budget, proving the timeout->504 path actually fires rather
 * than relying on a flaky "make the renderer slow" fixture.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
    "renderer.internal-token=test-internal-token",
    "renderer.timeout-ms=1",
})
class RenderControllerTimeoutTest {

    private static final String VALID_TOKEN = "test-internal-token";


    @Autowired
    private TestRestTemplate restTemplate;


    @Test
    void reportsAControlledGatewayTimeoutWhenRenderingExceedsTheConfiguredBudget() {
        RenderRequest request = new RenderRequest();
        request.setArtifactCode("SALES_REPORT");
        request.setFormat("PDF");

        RenderRow row = new RenderRow();
        row.setNo("001");
        row.setLabel("Example");
        row.setOccurredAt("2026-09-16T10:00:00Z");
        row.setStatus("OPEN");
        row.setQuantity(1);
        row.setUnitPrice(BigDecimal.ONE);
        row.setAmount(BigDecimal.ONE);
        request.setRows(List.of(row));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(VALID_TOKEN);

        ResponseEntity<ErrorResponse> response =
            restTemplate.postForEntity("/render", new HttpEntity<>(request, headers), ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
        assertThat(response.getBody().error()).isEqualTo("RENDER_TIMEOUT");
    }
}
