package com.metnex.jasperrenderer.exception;

import com.metnex.jasperrenderer.web.dto.ErrorResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Every error response is JSON — never an HTML error page or a raw stack trace. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RendererException.class)
    public ResponseEntity<ErrorResponse> handleRendererException(RendererException ex) {
        return respond(ex.getStatus(), ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        return respond(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "İstek gövdesi geçersiz: " + ex.getMessage());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadable(HttpMessageNotReadableException ex) {
        return respond(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "İstek gövdesi ayrıştırılamadı");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Beklenmeyen bir hata oluştu");
    }

    private ResponseEntity<ErrorResponse> respond(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status)
            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .body(new ErrorResponse(code, message));
    }
}
