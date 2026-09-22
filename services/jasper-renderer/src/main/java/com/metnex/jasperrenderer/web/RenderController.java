package com.metnex.jasperrenderer.web;

import com.metnex.jasperrenderer.render.JasperRenderService;
import com.metnex.jasperrenderer.render.RenderedDocument;
import com.metnex.jasperrenderer.web.dto.RenderRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RenderController {

    private final JasperRenderService renderService;

    public RenderController(JasperRenderService renderService) {
        this.renderService = renderService;
    }

    @PostMapping("/render")
    public ResponseEntity<byte[]> render(@Valid @RequestBody RenderRequest request) {
        RenderedDocument document = renderService.render(request);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(document.contentType()))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + document.fileName() + "\"")
            .body(document.bytes());
    }
}
