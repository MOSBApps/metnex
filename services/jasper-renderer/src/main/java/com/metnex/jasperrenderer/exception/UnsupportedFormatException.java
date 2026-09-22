package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

public class UnsupportedFormatException extends RendererException {
    public UnsupportedFormatException(String format) {
        super("UNSUPPORTED_FORMAT", HttpStatus.BAD_REQUEST, "Desteklenmeyen format: " + format);
    }
}
