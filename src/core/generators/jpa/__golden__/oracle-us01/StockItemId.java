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

    private Long productId;

    public StockItemId() {
    }

    public StockItemId(String countryCode, String warehouseCode, Long productId) {
        this.countryCode = countryCode;
        this.warehouseCode = warehouseCode;
        this.productId = productId;
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

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
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
                && Objects.equals(productId, that.productId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(countryCode, warehouseCode, productId);
    }
}
