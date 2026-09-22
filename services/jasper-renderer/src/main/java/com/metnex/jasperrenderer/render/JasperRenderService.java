package com.metnex.jasperrenderer.render;

import com.metnex.jasperrenderer.config.RendererProperties;
import com.metnex.jasperrenderer.exception.PayloadTooLargeException;
import com.metnex.jasperrenderer.exception.RenderFailedException;
import com.metnex.jasperrenderer.exception.RenderTimeoutException;
import com.metnex.jasperrenderer.exception.UnsupportedFormatException;
import com.metnex.jasperrenderer.template.TemplateRegistry;
import com.metnex.jasperrenderer.web.dto.RenderRequest;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.data.JRBeanCollectionDataSource;
import net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import net.sf.jasperreports.export.SimpleXlsxReportConfiguration;
import org.springframework.stereotype.Service;

@Service
public class JasperRenderService {

    private static final Set<String> SUPPORTED_FORMATS = Set.of("PDF", "XLSX");
    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String XLSX_CONTENT_TYPE =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final TemplateRegistry templateRegistry;
    private final RendererProperties properties;
    private final ExecutorService renderExecutor = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "jasper-render-worker");
        thread.setDaemon(true);
        return thread;
    });

    public JasperRenderService(TemplateRegistry templateRegistry, RendererProperties properties) {
        this.templateRegistry = templateRegistry;
        this.properties = properties;
    }

    public RenderedDocument render(RenderRequest request) {
        String format = request.getFormat() == null ? "" : request.getFormat().toUpperCase(Locale.ROOT);
        if (!SUPPORTED_FORMATS.contains(format)) {
            throw new UnsupportedFormatException(request.getFormat());
        }

        List<?> rows = request.getRows();
        if (rows.size() > properties.getMaxRows()) {
            throw new PayloadTooLargeException(
                "Render payload çok büyük: satır sayısı " + properties.getMaxRows() + " sınırını aşıyor");
        }

        JasperReport report = (request.getTemplateId() != null && !request.getTemplateId().isBlank())
            ? templateRegistry.resolve(request.getTemplateId())
            : templateRegistry.defaultTemplate();

        byte[] bytes = renderWithTimeout(report, request, format);
        String contentType = format.equals("PDF") ? PDF_CONTENT_TYPE : XLSX_CONTENT_TYPE;
        String fileName = safeFileName(request.getArtifactCode()) + "." + format.toLowerCase(Locale.ROOT);

        return new RenderedDocument(bytes, contentType, fileName);
    }

    private byte[] renderWithTimeout(JasperReport report, RenderRequest request, String format) {
        Future<byte[]> future = renderExecutor.submit(() -> doRender(report, request, format));
        try {
            return future.get(properties.getTimeoutMs(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new RenderTimeoutException();
        } catch (Exception e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            throw new RenderFailedException(cause);
        }
    }

    private byte[] doRender(JasperReport report, RenderRequest request, String format) throws Exception {
        Map<String, Object> params = new HashMap<>();
        params.put("ARTIFACT_TITLE", request.getArtifactCode());

        JRBeanCollectionDataSource dataSource = new JRBeanCollectionDataSource(request.getRows());
        // No connection argument is ever passed — the engine has no JDBC/SQL access path here.
        JasperPrint print = JasperFillManager.fillReport(report, params, dataSource);

        if (format.equals("PDF")) {
            return JasperExportManager.exportReportToPdf(print);
        }

        JRXlsxExporter exporter = new JRXlsxExporter();
        exporter.setExporterInput(new SimpleExporterInput(print));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(out));
        SimpleXlsxReportConfiguration config = new SimpleXlsxReportConfiguration();
        config.setOnePagePerSheet(false);
        exporter.setConfiguration(config);
        exporter.exportReport();
        return out.toByteArray();
    }

    private String safeFileName(String artifactCode) {
        String safe = artifactCode == null
            ? ""
            : artifactCode.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]+", "-").replaceAll("^-+|-+$", "");
        return safe.isBlank() ? "report" : safe;
    }
}
