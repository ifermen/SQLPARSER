package com.example.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Clave primaria compuesta de {@link OrderLine} (se usa con {@code @IdClass}).
 */
public class OrderLineId implements Serializable {

    private static final long serialVersionUID = 1L;

    private Integer orderId;

    private Long productId;

    public OrderLineId() {
    }

    public OrderLineId(Integer orderId, Long productId) {
        this.orderId = orderId;
        this.productId = productId;
    }

    public Integer getOrderId() {
        return orderId;
    }

    public void setOrderId(Integer orderId) {
        this.orderId = orderId;
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
        if (!(other instanceof OrderLineId)) {
            return false;
        }
        OrderLineId that = (OrderLineId) other;
        return Objects.equals(orderId, that.orderId)
                && Objects.equals(productId, that.productId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(orderId, productId);
    }
}
