package com.metnex.jasperrenderer.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * All limits mirror the values enforced on the API side (ReportRenderService /
 * TemplateRegistryService in apps/api/src/reporting) so both ends of the contract agree.
 */
@ConfigurationProperties(prefix = "renderer")
public class RendererProperties {

    /** REPORT_RENDER_INTERNAL_TOKEN — mandatory for any real deployment; blank disables /render entirely. */
    private String internalToken = "";

    private long timeoutMs = 15000;

    private int maxRows = 5000;

    private long maxPayloadBytes = 10L * 1024 * 1024;

    private long maxTemplateBytes = 256L * 1024;

    public String getInternalToken() {
        return internalToken;
    }

    public void setInternalToken(String internalToken) {
        this.internalToken = internalToken;
    }

    public long getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(long timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public int getMaxRows() {
        return maxRows;
    }

    public void setMaxRows(int maxRows) {
        this.maxRows = maxRows;
    }

    public long getMaxPayloadBytes() {
        return maxPayloadBytes;
    }

    public void setMaxPayloadBytes(long maxPayloadBytes) {
        this.maxPayloadBytes = maxPayloadBytes;
    }

    public long getMaxTemplateBytes() {
        return maxTemplateBytes;
    }

    public void setMaxTemplateBytes(long maxTemplateBytes) {
        this.maxTemplateBytes = maxTemplateBytes;
    }
}
