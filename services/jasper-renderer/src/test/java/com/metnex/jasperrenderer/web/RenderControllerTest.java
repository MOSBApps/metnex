package com.metnex.jasperrenderer.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.metnex.jasperrenderer.web.dto.ErrorResponse;
import com.metnex.jasperrenderer.web.dto.RenderRequest;
import com.metnex.jasperrenderer.web.dto.RenderRow;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;

@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
    "renderer.internal-token=test-internal-token",
})
class RenderControllerTest {

    private static final String VALID_TOKEN = "test-internal-token";

    @Autowired
    private TestRestTemplate restTemplate;

    @BeforeEach
    void useJdkHttpClient() {
        // The default SimpleClientHttpRequestFactory (java.net.HttpURLConnection) cannot cleanly
        // retry-read a 401 response body after streaming a POST body — a long-standing JDK
        // limitation ("cannot retry due to server authentication, in streaming mode"), not a bug
        // in TokenAuthFilter. JdkClientHttpRequestFactory (java.net.http.HttpClient) doesn't have
        // this limitation, so tests that expect a 401 on /render use it instead.
        restTemplate.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
    }


    private HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return headers;
    }

    private RenderRequest sampleRequest(String templateId, String format) {
        RenderRequest request = new RenderRequest();
        request.setArtifactCode("SALES_REPORT");
        request.setTemplateId(templateId);
        request.setFormat(format);

        RenderRow row = new RenderRow();
        row.setNo("001");
        row.setLabel("Example");
        row.setOccurredAt("2026-09-16T10:00:00Z");
        row.setStatus("OPEN");
        row.setQuantity(2);
        row.setUnitPrice(new BigDecimal("100.00"));
        row.setAmount(new BigDecimal("200.00"));
        request.setRows(List.of(row));

        return request;
    }

    @Test
    void healthEndpointNeedsNoAuthAndReportsUp() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/health", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "UP").containsEntry("service", "jasper-renderer");
    }

    @Test
    void rendersARealPdfWithTheBuiltInDefaultTemplate() {
        HttpEntity<RenderRequest> entity = new HttpEntity<>(sampleRequest(null, "PDF"), authHeaders(VALID_TOKEN));

        ResponseEntity<byte[]> response = restTemplate.postForEntity("/render", entity, byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
            .isEqualTo("attachment; filename=\"sales_report.pdf\"");
        byte[] body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(new String(body, 0, 5)).isEqualTo("%PDF-");
    }

    @Test
    void rendersARealXlsxWithTheBuiltInDefaultTemplate() {
        HttpEntity<RenderRequest> entity = new HttpEntity<>(sampleRequest(null, "XLSX"), authHeaders(VALID_TOKEN));

        ResponseEntity<byte[]> response = restTemplate.postForEntity("/render", entity, byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
            .isEqualTo(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
            .isEqualTo("attachment; filename=\"sales_report.xlsx\"");
        byte[] body = response.getBody();
        assertThat(body).isNotNull();
        // XLSX is a ZIP container — real OOXML output, not CSV mislabeled as XLSX.
        assertThat(new String(body, 0, 2)).isEqualTo("PK");
    }

    @Test
    void rendersUsingTheAllowlistedSampleReportTemplateId() {
        HttpEntity<RenderRequest> entity =
            new HttpEntity<>(sampleRequest("sample-report", "PDF"), authHeaders(VALID_TOKEN));

        ResponseEntity<byte[]> response = restTemplate.postForEntity("/render", entity, byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(new String(response.getBody(), 0, 5)).isEqualTo("%PDF-");
    }

    @Test
    void rejectsAnUnsupportedFormat() {
        HttpEntity<RenderRequest> entity = new HttpEntity<>(sampleRequest(null, "CSV"), authHeaders(VALID_TOKEN));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error()).isEqualTo("UNSUPPORTED_FORMAT");
    }

    @Test
    void rejectsARequestWithNoAuthorizationHeader() {
        HttpEntity<RenderRequest> entity = new HttpEntity<>(sampleRequest(null, "PDF"), authHeaders(null));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().error()).isEqualTo("UNAUTHORIZED");
    }

    @Test
    void rejectsARequestWithAnIncorrectToken() {
        HttpEntity<RenderRequest> entity =
            new HttpEntity<>(sampleRequest(null, "PDF"), authHeaders("wrong-token"));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().error()).isEqualTo("UNAUTHORIZED");
    }

    @Test
    void reportsAControlledNotFoundForAWellFormedButUnregisteredTemplateId() {
        HttpEntity<RenderRequest> entity =
            new HttpEntity<>(sampleRequest("unknown-report", "PDF"), authHeaders(VALID_TOKEN));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().error()).isEqualTo("TEMPLATE_NOT_FOUND");
    }

    @Test
    void rejectsATemplateIdContainingPathTraversalCharacters() {
        HttpEntity<RenderRequest> entity =
            new HttpEntity<>(sampleRequest("../../etc/passwd", "PDF"), authHeaders(VALID_TOKEN));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error()).isEqualTo("INVALID_TEMPLATE_ID");
    }

    @Test
    void rejectsAMalformedRequestMissingRequiredFields() {
        HttpEntity<String> entity = new HttpEntity<>("{\"format\":\"PDF\"}", authHeaders(VALID_TOKEN));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error()).isEqualTo("MALFORMED_REQUEST");
    }

    @Test
    void rejectsMalformedJsonBody() {
        HttpEntity<String> entity = new HttpEntity<>("{not-json", authHeaders(VALID_TOKEN));

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity("/render", entity, ErrorResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error()).isEqualTo("MALFORMED_REQUEST");
    }

    @Test
    void restTemplateSmokeCheckUsesPostMethodExplicitly() {
        // Guards against a future refactor accidentally changing /render to a non-POST method.
        HttpEntity<RenderRequest> entity = new HttpEntity<>(sampleRequest(null, "PDF"), authHeaders(VALID_TOKEN));
        ResponseEntity<byte[]> response =
            restTemplate.exchange("/render", HttpMethod.POST, entity, byte[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
