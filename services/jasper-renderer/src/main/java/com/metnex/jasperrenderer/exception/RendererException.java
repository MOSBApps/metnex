package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

/** Base type for controlled, JSON-mapped renderer errors — never a raw stack trace to the caller. */
public abstract class RendererException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    protected RendererException(String code, HttpStatus status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
