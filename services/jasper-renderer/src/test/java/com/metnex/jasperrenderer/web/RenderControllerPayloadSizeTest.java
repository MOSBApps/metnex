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
 * Separate (tiny) Spring context: renderer.max-payload-bytes is set far below a realistic request
 * so the PayloadSizeFilter's Content-Length check is exercised deterministically, without needing
 * to actually construct an 11MB request body over the wire.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
    "renderer.internal-token=test-internal-token",
    "renderer.max-payload-bytes=100",
})
class RenderControllerPayloadSizeTest {

    private static final String VALID_TOKEN = "test-internal-token";


    @Autowired
    private TestRestTemplate restTemplate;


    @Test
    void rejectsARequestBodyLargerThanTheConfiguredLimitBeforeParsingIt() {
        RenderRequest request = new RenderRequest();
        request.setArtifactCode("SALES_REPORT");
        request.setFormat("PDF");

        RenderRow row = new RenderRow();
        row.setNo("001");
        row.setLabel("A label long enough to push this JSON body past the 100-byte test limit");
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

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody().error()).isEqualTo("PAYLOAD_TOO_LARGE");
    }
}
