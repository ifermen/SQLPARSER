-- US-01 · Criterio 2: dos tablas relacionadas por FK (MySQL)
CREATE TABLE `customer` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Clientes de la tienda';

CREATE TABLE `purchase_order` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL COMMENT 'Cliente que realiza el pedido',
  `status` ENUM('NEW','PAID','SHIPPED') NOT NULL DEFAULT 'NEW',
  `total` DECIMAL(12,2) UNSIGNED,
  PRIMARY KEY (`id`),
  KEY `idx_order_customer` (`customer_id`),
  CONSTRAINT `fk_order_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
