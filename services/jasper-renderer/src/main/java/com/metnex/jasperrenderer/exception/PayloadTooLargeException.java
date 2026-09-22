package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

public class PayloadTooLargeException extends RendererException {
    public PayloadTooLargeException(String message) {
        super("PAYLOAD_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE, message);
    }
}
