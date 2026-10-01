package com.example.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Clave primaria compuesta de {@link Warehouse} (se usa con {@code @IdClass}).
 */
public class WarehouseId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String countryCode;

    private String code;

    public WarehouseId() {
    }

    public WarehouseId(String countryCode, String code) {
        this.countryCode = countryCode;
        this.code = code;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof WarehouseId)) {
            return false;
        }
        WarehouseId that = (WarehouseId) other;
        return Objects.equals(countryCode, that.countryCode)
                && Objects.equals(code, that.code);
    }

    @Override
    public int hashCode() {
        return Objects.hash(countryCode, code);
    }
}
