package com.metnex.jasperrenderer.web.dto;

import java.math.BigDecimal;

/**
 * Domain-agnostic row shape — mirrors ReportDatasetRow in
 * apps/api/src/reporting/dataset/report-dataset.contract.ts field-for-field. Getter names must
 * match exactly: JasperReports binds JRXML $F{no} etc. to these via JRBeanCollectionDataSource
 * reflection (getNo(), getLabel(), ...).
 */
public class RenderRow {

    private String no;
    private String label;
    private String occurredAt;
    private String status;
    private Integer quantity;
    private BigDecimal unitPrice;
    private BigDecimal amount;

    public String getNo() {
        return no;
    }

    public void setNo(String no) {
        this.no = no;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(String occurredAt) {
        this.occurredAt = occurredAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public void setUnitPrice(BigDecimal unitPrice) {
        this.unitPrice = unitPrice;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }
}
