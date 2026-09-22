package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

/** Wraps an unexpected JasperReports engine failure (bad template, bad data) as a 500. */
public class RenderFailedException extends RendererException {
    public RenderFailedException(Throwable cause) {
        super("RENDER_FAILED", HttpStatus.INTERNAL_SERVER_ERROR, "Render başarısız: " + cause.getMessage());
        initCause(cause);
    }
}
