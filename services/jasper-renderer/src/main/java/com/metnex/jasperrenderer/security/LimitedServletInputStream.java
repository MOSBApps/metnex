package com.metnex.jasperrenderer.security;

import com.metnex.jasperrenderer.exception.PayloadTooLargeException;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import java.io.IOException;

/**
 * Enforces the payload byte limit at the stream level, not just via the (client-controlled,
 * sometimes absent for chunked transfer encoding) Content-Length header — so a request that omits
 * Content-Length can't bypass PayloadSizeFilter's check.
 */
class LimitedServletInputStream extends ServletInputStream {

    private final ServletInputStream delegate;
    private final long maxBytes;
    private long readCount = 0;

    LimitedServletInputStream(ServletInputStream delegate, long maxBytes) {
        this.delegate = delegate;
        this.maxBytes = maxBytes;
    }

    @Override
    public int read() throws IOException {
        int b = delegate.read();
        if (b != -1) {
            readCount++;
            checkLimit();
        }
        return b;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        int n = delegate.read(b, off, len);
        if (n > 0) {
            readCount += n;
            checkLimit();
        }
        return n;
    }

    private void checkLimit() {
        if (readCount > maxBytes) {
            throw new PayloadTooLargeException("Request body exceeds the configured limit");
        }
    }

    @Override
    public boolean isFinished() {
        return delegate.isFinished();
    }

    @Override
    public boolean isReady() {
        return delegate.isReady();
    }

    @Override
    public void setReadListener(ReadListener readListener) {
        delegate.setReadListener(readListener);
    }
}
