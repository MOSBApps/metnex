package com.metnex.jasperrenderer.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.metnex.jasperrenderer.web.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

/** Shared JSON error writer for the security filters, which run outside Spring MVC's dispatch. */
final class RendererErrorResponses {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private RendererErrorResponses() {
    }

    static void writeUnauthorized(HttpServletResponse response) throws IOException {
        write(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Missing or invalid internal renderer token");
    }

    static void writePayloadTooLarge(HttpServletResponse response) throws IOException {
        write(response, HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", "Request body exceeds the configured limit");
    }

    private static void write(HttpServletResponse response, HttpStatus status, String error, String message)
        throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(OBJECT_MAPPER.writeValueAsString(new ErrorResponse(error, message)));
    }
}
