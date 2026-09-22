package com.metnex.jasperrenderer.render;

public record RenderedDocument(byte[] bytes, String contentType, String fileName) {
}
