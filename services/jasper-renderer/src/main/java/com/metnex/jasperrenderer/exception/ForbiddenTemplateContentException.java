package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

public class ForbiddenTemplateContentException extends RendererException {
    public ForbiddenTemplateContentException(String forbiddenToken) {
        super("JRXML_SANDBOX_VIOLATION", HttpStatus.BAD_REQUEST, "JRXML sandbox violation: " + forbiddenToken);
    }
}
