package com.metnex.jasperrenderer.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.metnex.jasperrenderer.web.dto.ErrorResponse;
import com.metnex.jasperrenderer.web.dto.RenderRequest;
import com.metnex.jasperrenderer.web.dto.RenderRow;
import java.math.BigDecimal;
import java.util.ArrayList;
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

/** Separate (tiny) Spring context so these limits don't affect the other, realistic test classes. */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
    "renderer.internal-token=test-internal-token",
    "renderer.max-rows=2",
})
class RenderControllerLimitsTest {

    private static final String VALID_TOKEN = "test-internal-token";


    @Autowired
    private TestRestTemplate restTemplate;


    private RenderRow row(String no) {
        RenderRow row = new RenderRow();
        row.setNo(no);
        row.setLabel("Row " + no);
        row.setOccurredAt("2026-09-16T10:00:00Z");
        row.setStatus("OPEN");
        row.setQuantity(1);
        row.setUnitPrice(BigDecimal.ONE);
        row.setAmount(BigDecimal.ONE);
        return row;
    }

    @Test
    void rejectsARowListLargerThanTheConfiguredLimit() {
        RenderRequest request = new RenderRequest();
        request.setArtifactCode("SALES_REPORT");
        request.setFormat("PDF");
        List<RenderRow> rows = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            rows.add(row("row-" + i));
        }
        request.setRows(rows);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(VALID_TOKEN);

        ResponseEntity<ErrorResponse> response =
            restTemplate.postForEntity("/render", new HttpEntity<>(request, headers), ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody().error()).isEqualTo("PAYLOAD_TOO_LARGE");
    }
}
