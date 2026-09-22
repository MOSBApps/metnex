package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

public class RenderTimeoutException extends RendererException {
    public RenderTimeoutException() {
        super("RENDER_TIMEOUT", HttpStatus.GATEWAY_TIMEOUT, "Render işlemi zaman aşımına uğradı");
    }
}
