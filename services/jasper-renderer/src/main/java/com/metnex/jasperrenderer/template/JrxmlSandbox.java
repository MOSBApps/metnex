package com.metnex.jasperrenderer.template;

import com.metnex.jasperrenderer.exception.ForbiddenTemplateContentException;
import com.metnex.jasperrenderer.exception.PayloadTooLargeException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Standalone, directly-testable JRXML content sandbox check — mirrors
 * apps/api/src/reporting/templates/template-registry.ts's assertJrxmlSandboxSafe() on the API
 * side. Kept independent of Spring/the allowlist so it can be exercised with fabricated content
 * in tests without needing a real allowlisted classpath resource.
 */
public final class JrxmlSandbox {

    /** Forbidden JRXML substrings — shell exec, filesystem, JDBC/SQL, outbound network. */
    static final List<String> FORBIDDEN_TOKENS = List.of(
        "java.sql",
        "jdbc:",
        "java.io.File",
        "Runtime.getRuntime",
        "ProcessBuilder",
        "System.exit",
        "java.net",
        "<queryString");

    private JrxmlSandbox() {
    }

    public static void assertSafe(byte[] content, long maxBytes) {
        if (content.length > maxBytes) {
            throw new PayloadTooLargeException(
                "Template boyutu izin verilen sınırı (" + maxBytes + " byte) aşıyor");
        }
        String jrxml = new String(content, StandardCharsets.UTF_8);
        for (String token : FORBIDDEN_TOKENS) {
            if (jrxml.contains(token)) {
                throw new ForbiddenTemplateContentException(token);
            }
        }
    }
}
