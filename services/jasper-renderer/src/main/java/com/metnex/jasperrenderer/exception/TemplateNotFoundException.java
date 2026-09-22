package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

/** Well-formed templateId, but not present in the allowlist. */
public class TemplateNotFoundException extends RendererException {
    public TemplateNotFoundException(String templateId) {
        super("TEMPLATE_NOT_FOUND", HttpStatus.NOT_FOUND, "Template allowlist'te bulunamadı: " + templateId);
    }
}
