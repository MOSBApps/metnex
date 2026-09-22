package com.metnex.jasperrenderer.security;

import com.metnex.jasperrenderer.config.RendererProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Enforces the render payload byte limit two ways: a fast-path rejection from the declared
 * Content-Length header when present, and a stream-level cap (LimitedServletInputStream) that
 * still applies when the client omits Content-Length (e.g. chunked transfer encoding) — so the
 * limit can't be bypassed by simply not declaring a length. Either path surfaces as the same
 * PayloadTooLargeException, handled by GlobalExceptionHandler exactly like any other
 * controller-thrown error (it fires while Spring parses the @RequestBody, still inside
 * DispatcherServlet's normal exception-resolving pipeline).
 */
@Component
@Order(10)
public class PayloadSizeFilter extends OncePerRequestFilter {

    private final RendererProperties properties;

    public PayloadSizeFilter(RendererProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (!"/render".equals(request.getRequestURI())) {
            chain.doFilter(request, response);
            return;
        }

        long contentLength = request.getContentLengthLong();
        long maxBytes = properties.getMaxPayloadBytes();
        if (contentLength >= 0 && contentLength > maxBytes) {
            // Thrown here (outside any Spring MVC dispatch) — GlobalExceptionHandler only covers
            // dispatched requests, so this fast path must build the response itself.
            RendererErrorResponses.writePayloadTooLarge(response);
            return;
        }

        HttpServletRequest limited = new HttpServletRequestWrapper(request) {
            @Override
            public ServletInputStream getInputStream() throws IOException {
                return new LimitedServletInputStream(request.getInputStream(), maxBytes);
            }
        };

        chain.doFilter(limited, response);
    }
}
