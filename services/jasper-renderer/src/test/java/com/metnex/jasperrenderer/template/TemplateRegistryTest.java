package com.metnex.jasperrenderer.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.metnex.jasperrenderer.config.RendererProperties;
import com.metnex.jasperrenderer.exception.InvalidTemplateIdException;
import com.metnex.jasperrenderer.exception.TemplateNotFoundException;
import net.sf.jasperreports.engine.JasperReport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TemplateRegistryTest {

    private final TemplateRegistry registry = new TemplateRegistry(new RendererProperties());

    @ParameterizedTest
    @ValueSource(strings = {
        "../../etc/passwd",
        "..%2f..%2fetc%2fpasswd",
        "sales/../../secret",
        "/etc/passwd",
        "Sales Report",
        "sales_report",
        "",
    })
    void rejectsPathTraversalOrIllegalTemplateIds(String templateId) {
        assertThatThrownBy(() -> registry.resolve(templateId)).isInstanceOf(InvalidTemplateIdException.class);
        assertThat(registry.has(templateId)).isFalse();
    }

    @Test
    void reportsAControlledNotFoundForAWellFormedButUnregisteredTemplateId() {
        assertThatThrownBy(() -> registry.resolve("unknown-report")).isInstanceOf(TemplateNotFoundException.class);
        assertThat(registry.has("unknown-report")).isFalse();
    }

    @Test
    void resolvesTheAllowlistedSampleReportTemplateAndCompilesItForReal() {
        assertThat(registry.has("sample-report")).isTrue();

        JasperReport report = registry.resolve("sample-report");

        assertThat(report).isNotNull();
        assertThat(report.getName()).isEqualTo("sample-report");
    }

    @Test
    void resolvesTheAllowlistedScadaAnalysisReportTemplateAndFillsItFromTextRows() throws Exception {
        assertThat(registry.has("scada-analysis-report")).isTrue();

        JasperReport report = registry.resolve("scada-analysis-report");
        assertThat(report.getName()).isEqualTo("scada-analysis-report");

        com.metnex.jasperrenderer.web.dto.RenderRow row = new com.metnex.jasperrenderer.web.dto.RenderRow();
        row.setKind("DATA");
        row.setC1("2025-01-01T00:00:00Z");
        row.setC2("Şebeke [sanal x v1]");
        row.setC4("12.5");
        net.sf.jasperreports.engine.JasperPrint print = net.sf.jasperreports.engine.JasperFillManager.fillReport(
            report,
            new java.util.HashMap<>(),
            new net.sf.jasperreports.engine.data.JRBeanCollectionDataSource(java.util.List.of(row)));
        assertThat(print.getPages()).hasSize(1);
        assertThat(net.sf.jasperreports.engine.JasperExportManager.exportReportToPdf(print)).isNotEmpty();
    }

    @Test
    void compilesTheBuiltInDefaultTemplateUsedWhenNoTemplateIdIsGiven() {
        JasperReport report = registry.defaultTemplate();

        assertThat(report).isNotNull();
        assertThat(report.getName()).isEqualTo("default-report");
    }
}
