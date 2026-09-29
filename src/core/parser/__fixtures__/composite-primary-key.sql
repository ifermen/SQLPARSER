-- US-01 · Criterio 6: claves primarias compuestas, FK compuesta y UNIQUE compuesta
-- (SQL estándar, sin rasgos de dialecto)
CREATE TABLE warehouse (
  country_code CHAR(2) NOT NULL,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  CONSTRAINT pk_warehouse PRIMARY KEY (country_code, code)
);

CREATE TABLE stock_item (
  country_code CHAR(2) NOT NULL,
  warehouse_code VARCHAR(10) NOT NULL,
  sku VARCHAR(32) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  batch VARCHAR(20),
  CONSTRAINT pk_stock_item PRIMARY KEY (country_code, warehouse_code, sku),
  CONSTRAINT fk_stock_warehouse FOREIGN KEY (country_code, warehouse_code)
    REFERENCES warehouse (country_code, code),
  CONSTRAINT uq_stock_batch UNIQUE (sku, batch)
);
