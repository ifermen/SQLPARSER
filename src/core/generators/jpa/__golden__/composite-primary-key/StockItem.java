package com.example.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinColumns;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "stock_item", uniqueConstraints = {
        @UniqueConstraint(name = "uq_stock_batch", columnNames = {"sku", "batch"})
})
@IdClass(StockItemId.class)
public class StockItem {

    @Id
    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Id
    @Column(name = "warehouse_code", nullable = false, length = 10)
    private String warehouseCode;

    @Id
    @Column(name = "sku", nullable = false, length = 32)
    private String sku;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @Column(name = "batch", length = 20)
    private String batch;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumns({
            @JoinColumn(name = "country_code", referencedColumnName = "country_code", nullable = false, insertable = false, updatable = false),
            @JoinColumn(name = "warehouse_code", referencedColumnName = "code", nullable = false, insertable = false, updatable = false)
    })
    private Warehouse warehouse;

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }

    public String getWarehouseCode() {
        return warehouseCode;
    }

    public void setWarehouseCode(String warehouseCode) {
        this.warehouseCode = warehouseCode;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public String getBatch() {
        return batch;
    }

    public void setBatch(String batch) {
        this.batch = batch;
    }

    public Warehouse getWarehouse() {
        return warehouse;
    }

    public void setWarehouse(Warehouse warehouse) {
        this.warehouse = warehouse;
    }
}
