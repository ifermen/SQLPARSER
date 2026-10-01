import { describe, expect, it } from 'vitest';
import type { PlannedEntity, PlannedIdClass } from './planEntities';
import { renderEntity, renderIdClass } from './renderJava';

describe('renderEntity', () => {
  const entity: PlannedEntity = {
    className: 'PurchaseOrder',
    tableName: 'purchase_order',
    javadoc: ['Pedidos'],
    annotations: ['@Entity', '@Table(name = "purchase_order")'],
    enums: [{ name: 'Status', constants: ['NEW', 'PAID'] }],
    fields: [
      { name: 'id', javaType: 'Integer', annotations: ['@Id', '@Column(name = "id", nullable = false)'] },
      {
        name: 'status',
        javaType: 'Status',
        annotations: ['@Enumerated(EnumType.STRING)', '@Column(name = "status")'],
        javadoc: 'Estado del pedido',
      },
      {
        name: 'lines',
        javaType: 'List<OrderLine>',
        initializer: 'new ArrayList<>()',
        annotations: ['@OneToMany(mappedBy = "purchaseOrder")'],
      },
    ],
    imports: ['java.util.List', 'jakarta.persistence.Id', 'java.util.ArrayList', 'jakarta.persistence.Entity', 'java.util.List'],
  };

  it('genera paquete, imports agrupados y ordenados, javadoc, enum anidado, campos y accesores', () => {
    expect(renderEntity(entity, 'com.example.entity')).toBe(
      [
        'package com.example.entity;',
        '',
        'import jakarta.persistence.Entity;',
        'import jakarta.persistence.Id;',
        '',
        'import java.util.ArrayList;',
        'import java.util.List;',
        '',
        '/**',
        ' * Pedidos',
        ' */',
        '@Entity',
        '@Table(name = "purchase_order")',
        'public class PurchaseOrder {',
        '',
        '    public enum Status {',
        '        NEW, PAID',
        '    }',
        '',
        '    @Id',
        '    @Column(name = "id", nullable = false)',
        '    private Integer id;',
        '',
        '    /**',
        '     * Estado del pedido',
        '     */',
        '    @Enumerated(EnumType.STRING)',
        '    @Column(name = "status")',
        '    private Status status;',
        '',
        '    @OneToMany(mappedBy = "purchaseOrder")',
        '    private List<OrderLine> lines = new ArrayList<>();',
        '',
        '    public Integer getId() {',
        '        return id;',
        '    }',
        '',
        '    public void setId(Integer id) {',
        '        this.id = id;',
        '    }',
        '',
        '    public Status getStatus() {',
        '        return status;',
        '    }',
        '',
        '    public void setStatus(Status status) {',
        '        this.status = status;',
        '    }',
        '',
        '    public List<OrderLine> getLines() {',
        '        return lines;',
        '    }',
        '',
        '    public void setLines(List<OrderLine> lines) {',
        '        this.lines = lines;',
        '    }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('sin paquete no escribe `package`; las anotaciones de varias líneas se sangran enteras', () => {
    const output = renderEntity(
      {
        ...entity,
        javadoc: ['Primer párrafo', 'Segundo párrafo'],
        enums: [],
        imports: [],
        fields: [{ name: 'id', javaType: 'Integer', annotations: ['@JoinColumns({\n        @JoinColumn(name = "a")\n})'] }],
      },
      '',
    );

    expect(output.startsWith('/**\n * Primer párrafo\n * <p>\n * Segundo párrafo\n */\n@Entity')).toBe(true);
    expect(output).toContain('    @JoinColumns({\n            @JoinColumn(name = "a")\n    })\n    private Integer id;');
  });
});

describe('renderIdClass', () => {
  const idClass: PlannedIdClass = {
    className: 'OrderLineId',
    entityClassName: 'OrderLine',
    fields: [
      { name: 'orderId', javaType: 'Integer' },
      { name: 'productId', javaType: 'Long' },
    ],
    imports: [],
  };

  it('Serializable, constructores, accesores, equals y hashCode', () => {
    expect(renderIdClass(idClass, 'com.example.entity')).toBe(
      [
        'package com.example.entity;',
        '',
        'import java.io.Serializable;',
        'import java.util.Objects;',
        '',
        '/**',
        ' * Clave primaria compuesta de {@link OrderLine} (se usa con {@code @IdClass}).',
        ' */',
        'public class OrderLineId implements Serializable {',
        '',
        '    private static final long serialVersionUID = 1L;',
        '',
        '    private Integer orderId;',
        '',
        '    private Long productId;',
        '',
        '    public OrderLineId() {',
        '    }',
        '',
        '    public OrderLineId(Integer orderId, Long productId) {',
        '        this.orderId = orderId;',
        '        this.productId = productId;',
        '    }',
        '',
        '    public Integer getOrderId() {',
        '        return orderId;',
        '    }',
        '',
        '    public void setOrderId(Integer orderId) {',
        '        this.orderId = orderId;',
        '    }',
        '',
        '    public Long getProductId() {',
        '        return productId;',
        '    }',
        '',
        '    public void setProductId(Long productId) {',
        '        this.productId = productId;',
        '    }',
        '',
        '    @Override',
        '    public boolean equals(Object other) {',
        '        if (this == other) {',
        '            return true;',
        '        }',
        '        if (!(other instanceof OrderLineId)) {',
        '            return false;',
        '        }',
        '        OrderLineId that = (OrderLineId) other;',
        '        return Objects.equals(orderId, that.orderId)',
        '                && Objects.equals(productId, that.productId);',
        '    }',
        '',
        '    @Override',
        '    public int hashCode() {',
        '        return Objects.hash(orderId, productId);',
        '    }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('los byte[] se comparan con Arrays y los nombres de variable no chocan con los campos', () => {
    const output = renderIdClass(
      {
        ...idClass,
        fields: [
          { name: 'other', javaType: 'String' },
          { name: 'checksum', javaType: 'byte[]' },
        ],
        imports: ['java.math.BigDecimal'],
      },
      'com.example',
    );

    expect(output).toContain('import java.math.BigDecimal;\nimport java.util.Arrays;\nimport java.util.Objects;');
    expect(output).toContain('public boolean equals(Object object) {');
    expect(output).toContain('return Objects.equals(other, that.other)\n                && Arrays.equals(checksum, that.checksum);');
    expect(output).toContain('int result = Objects.hash(other);\n        result = 31 * result + Arrays.hashCode(checksum);\n        return result;');
  });
});
