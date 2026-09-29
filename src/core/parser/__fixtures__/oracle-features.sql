-- Oracle: tipos propios, secuencias, SQL*Plus, PL/SQL y ALTER TABLE con listas
WHENEVER SQLERROR CONTINUE
SET SERVEROUTPUT ON

-- «Borrar si existe»: bloque anónimo terminado con /
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE audit_log PURGE';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -942 THEN RAISE; END IF;
END;
/

CREATE SEQUENCE audit_log_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE audit_log (
  id          NUMBER(19)        DEFAULT audit_log_seq.NEXTVAL NOT NULL,
  order#      NUMBER(10),
  event_type  VARCHAR2(30 CHAR) DEFAULT ON NULL 'UNKNOWN',
  payload     CLOB,
  attachment  BLOB,
  checksum    RAW(16),
  legacy_blob LONG RAW,
  ratio       BINARY_DOUBLE,
  score       FLOAT,
  logged_at   TIMESTAMP WITH LOCAL TIME ZONE DEFAULT SYSTIMESTAMP,
  logged_on   DATE,
  retention   INTERVAL DAY(3) TO SECOND(0),
  row_ref     UROWID,
  metadata    SYS.XMLTYPE,
  CONSTRAINT audit_log_pk PRIMARY KEY (id)
);

-- Autoincremento anterior a 12c: secuencia + trigger
CREATE SEQUENCE legacy_customer_seq;

CREATE TABLE legacy_customer (
  customer_id NUMBER(10) NOT NULL,
  full_name   NVARCHAR2(100),
  vip         CHAR(1) DEFAULT 'N' CHECK (vip IN ('Y', 'N')),
  CONSTRAINT legacy_customer_pk PRIMARY KEY (customer_id)
);

CREATE OR REPLACE TRIGGER legacy_customer_bi
BEFORE INSERT ON legacy_customer
FOR EACH ROW
WHEN (new.customer_id IS NULL)
BEGIN
  :new.customer_id := legacy_customer_seq.NEXTVAL;
END;
/

-- ALTER TABLE con listas entre paréntesis y MODIFY parcial
ALTER TABLE legacy_customer ADD (
  email      VARCHAR2(320),
  created_by NUMBER(19),
  CONSTRAINT legacy_customer_email_uk UNIQUE (email),
  CONSTRAINT legacy_customer_creator_fk FOREIGN KEY (created_by) REFERENCES audit_log (id)
);
ALTER TABLE legacy_customer MODIFY (full_name NOT NULL, vip DEFAULT 'Y');
ALTER TABLE legacy_customer MODIFY email VARCHAR2(500);

COMMENT ON COLUMN legacy_customer.full_name IS q'{Nombre completo; puede contener 'comillas'}';

-- Paquete PL/SQL con ; internos: no se interpreta, pero no rompe el análisis
CREATE OR REPLACE PACKAGE customer_api AS
  PROCEDURE register(p_name IN VARCHAR2);
  FUNCTION find(p_id IN NUMBER) RETURN VARCHAR2;
END customer_api;
/

CREATE OR REPLACE PUBLIC SYNONYM customers FOR legacy_customer;
GRANT SELECT ON legacy_customer TO reporting;

-- Crear tablas con SQL dinámico no se interpreta: se avisa
BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE tmp_import (id NUMBER)';
END;
/
EXIT
