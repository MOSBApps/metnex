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
    void compilesTheBuiltInDefaultTemplateUsedWhenNoTemplateIdIsGiven() {
        JasperReport report = registry.defaultTemplate();

        assertThat(report).isNotNull();
        assertThat(report.getName()).isEqualTo("default-report");
    }
}
