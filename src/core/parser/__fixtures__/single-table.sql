-- US-01 · Criterio 1: una tabla sin relaciones (PostgreSQL)
CREATE TABLE product (
  id BIGSERIAL PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL, -- Nombre comercial
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE product IS 'Productos del catálogo';
COMMENT ON COLUMN product.sku IS 'Código interno de producto';
