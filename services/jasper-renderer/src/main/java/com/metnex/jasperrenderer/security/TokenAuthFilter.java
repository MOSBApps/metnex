package com.metnex.jasperrenderer.security;

import com.metnex.jasperrenderer.config.RendererProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Guards /render with a mandatory bearer token, compared in constant time
 * (MessageDigest.isEqual — time-constant since JDK 6u17). /health stays open for container
 * healthchecks/orchestrator probes.
 */
@Component
@Order(20)
public class TokenAuthFilter extends OncePerRequestFilter {

    private final RendererProperties properties;

    public TokenAuthFilter(RendererProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (!"/render".equals(request.getRequestURI())) {
            chain.doFilter(request, response);
            return;
        }

        String configuredToken = properties.getInternalToken();
        boolean tokenConfigured = configuredToken != null && !configuredToken.isBlank();

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        String provided = (header != null && header.startsWith("Bearer ")) ? header.substring(7).trim() : null;

        boolean valid = tokenConfigured
            && provided != null
            && !provided.isBlank()
            && MessageDigest.isEqual(
                configuredToken.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));

        if (!valid) {
            RendererErrorResponses.writeUnauthorized(response);
            return;
        }

        chain.doFilter(request, response);
    }
}
