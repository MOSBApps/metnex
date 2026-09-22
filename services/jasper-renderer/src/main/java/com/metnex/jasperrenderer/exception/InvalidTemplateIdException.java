package com.metnex.jasperrenderer.exception;

import org.springframework.http.HttpStatus;

/** templateId failed the safe-slug pattern (e.g. path traversal, illegal characters). */
public class InvalidTemplateIdException extends RendererException {
    public InvalidTemplateIdException(String templateId) {
        super("INVALID_TEMPLATE_ID", HttpStatus.BAD_REQUEST, "Geçersiz template id: " + templateId);
    }
}
