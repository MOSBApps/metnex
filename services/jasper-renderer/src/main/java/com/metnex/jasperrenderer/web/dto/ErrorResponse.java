package com.metnex.jasperrenderer.web.dto;

/** Uniform JSON error body: { "error": "MACHINE_CODE", "message": "human readable detail" }. */
public record ErrorResponse(String error, String message) {
}
