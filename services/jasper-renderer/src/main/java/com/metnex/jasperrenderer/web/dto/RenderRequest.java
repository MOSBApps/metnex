package com.metnex.jasperrenderer.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class RenderRequest {

    @NotBlank
    private String artifactCode;

    /** Safe allowlisted slug, or null/blank for the built-in default layout — never a path. */
    private String templateId;

    @NotBlank
    private String format;

    @NotNull
    @Valid
    private List<RenderRow> rows;

    public String getArtifactCode() {
        return artifactCode;
    }

    public void setArtifactCode(String artifactCode) {
        this.artifactCode = artifactCode;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    public List<RenderRow> getRows() {
        return rows;
    }

    public void setRows(List<RenderRow> rows) {
        this.rows = rows;
    }
}
