package com.example.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Clave primaria compuesta de {@link StockItem} (se usa con {@code @IdClass}).
 */
public class StockItemId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String countryCode;

    private String warehouseCode;

    private String sku;

    public StockItemId() {
    }

    public StockItemId(String countryCode, String warehouseCode, String sku) {
        this.countryCode = countryCode;
        this.warehouseCode = warehouseCode;
        this.sku = sku;
    }

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

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof StockItemId)) {
            return false;
        }
        StockItemId that = (StockItemId) other;
        return Objects.equals(countryCode, that.countryCode)
                && Objects.equals(warehouseCode, that.warehouseCode)
                && Objects.equals(sku, that.sku);
    }

    @Override
    public int hashCode() {
        return Objects.hash(countryCode, warehouseCode, sku);
    }
}
