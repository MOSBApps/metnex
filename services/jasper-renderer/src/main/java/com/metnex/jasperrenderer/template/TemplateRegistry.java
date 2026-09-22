package com.metnex.jasperrenderer.template;

import com.metnex.jasperrenderer.config.RendererProperties;
import com.metnex.jasperrenderer.exception.InvalidTemplateIdException;
import com.metnex.jasperrenderer.exception.RenderFailedException;
import com.metnex.jasperrenderer.exception.TemplateNotFoundException;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperReport;
import org.springframework.stereotype.Component;

/**
 * Allowlist of renderer templates: templateId -> classpath resource under
 * src/main/resources/templates/ only. Mirrors apps/api/src/reporting/templates/template-registry.ts
 * on the API side — this is the renderer's own, independent enforcement of the same rule (defense
 * in depth: the API never forwards a filesystem path, and even if it somehow did, this registry
 * only ever resolves a safe slug against a fixed, code-defined map).
 */
@Component
public class TemplateRegistry {

    private static final Pattern TEMPLATE_ID_PATTERN = Pattern.compile("^[a-z0-9-]{1,64}$");

    /** Empty by default aside from the one demonstration template shipped with this service. */
    private static final Map<String, String> ALLOWLIST = Map.of(
        "sample-report", "templates/sample-report.jrxml");

    private static final String DEFAULT_TEMPLATE_RESOURCE = "templates/default-report.jrxml";

    private final RendererProperties properties;
    private final Map<String, JasperReport> compiledCache = new ConcurrentHashMap<>();

    public TemplateRegistry(RendererProperties properties) {
        this.properties = properties;
    }

    public boolean has(String templateId) {
        return templateId != null && TEMPLATE_ID_PATTERN.matcher(templateId).matches() && ALLOWLIST.containsKey(templateId);
    }

    public JasperReport resolve(String templateId) {
        if (!TEMPLATE_ID_PATTERN.matcher(templateId).matches()) {
            throw new InvalidTemplateIdException(templateId);
        }
        String resourcePath = ALLOWLIST.get(templateId);
        if (resourcePath == null) {
            throw new TemplateNotFoundException(templateId);
        }
        return compiledCache.computeIfAbsent(templateId, id -> compile(resourcePath));
    }

    public JasperReport defaultTemplate() {
        return compiledCache.computeIfAbsent("__default__", id -> compile(DEFAULT_TEMPLATE_RESOURCE));
    }

    private JasperReport compile(String classpathResource) {
        byte[] content = readClasspathResource(classpathResource);
        JrxmlSandbox.assertSafe(content, properties.getMaxTemplateBytes());
        try (InputStream in = new ByteArrayInputStream(content)) {
            return JasperCompileManager.compileReport(in);
        } catch (Exception e) {
            throw new RenderFailedException(e);
        }
    }

    private byte[] readClasspathResource(String classpathResource) {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(classpathResource)) {
            if (in == null) {
                throw new IllegalStateException("Template resource missing from classpath: " + classpathResource);
            }
            return in.readAllBytes();
        } catch (Exception e) {
            throw new RenderFailedException(e);
        }
    }
}
