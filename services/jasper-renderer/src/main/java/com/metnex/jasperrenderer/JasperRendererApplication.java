package com.metnex.jasperrenderer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class JasperRendererApplication {

    public static void main(String[] args) {
        SpringApplication.run(JasperRendererApplication.class, args);
    }
}
