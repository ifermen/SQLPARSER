# Entidades JPA generadas por SQLPARSER

Clases de entidad JPA (Jakarta Persistence) generadas a partir de un script SQL. Este fichero recoge la configuración usada, las tablas y relaciones detectadas, los ficheros generados, cómo integrarlos y el registro de avisos y errores del proceso.

## Configuración

| Opción | Valor |
| --- | --- |
| Generador | JPA (Jakarta Persistence) |
| Dialecto SQL | Oracle (detectado automáticamente) |
| Paquete base | `com.example.entity` |
| Librería de anotaciones | Jakarta Persistence (`jakarta.persistence`) |
| Lombok | No (se generan getters y setters) |
| Nombres de clase | Singular, PascalCase |
| Nombres de campo | camelCase |

## Tablas detectadas

2 tabla(s).

| Tabla | Tipo | Clase | Columnas | Clave primaria |
| --- | --- | --- | --- | --- |
| `audit_log` | Entidad | `AuditLog` | 14 | id |
| `legacy_customer` | Entidad | `LegacyCustomer` | 5 | customer_id |

## Relaciones inferidas

Cada relación indica el lado propietario (el que tiene la clave foránea o la tabla intermedia), el lado inverso y la regla que la originó.

| Lado propietario | Lado inverso | Regla aplicada |
| --- | --- | --- |
| `LegacyCustomer.auditLog` @ManyToOne | `AuditLog.legacyCustomers` @OneToMany | Clave foránea: muchos a uno (`legacy_customer(created_by)` → `audit_log`) |

## Ficheros generados

3 fichero(s):

- `src/main/java/com/example/entity/AuditLog.java`
- `src/main/java/com/example/entity/LegacyCustomer.java`
- `README.md` (este fichero)

## Cómo integrarlo

1. Copia el contenido de `src/main/java/` en el mismo directorio de tu proyecto (Java 17 o superior).
2. Añade Jakarta Persistence 3.x y un proveedor. Con Spring Boot 3 basta con `spring-boot-starter-data-jpa`; sin Spring, la API y un proveedor como Hibernate 6:

   ```xml
   <dependency>
       <groupId>jakarta.persistence</groupId>
       <artifactId>jakarta.persistence-api</artifactId>
       <version>3.1.0</version>
   </dependency>
   ```

3. Comprueba que el paquete `com.example.entity` se escanea como paquete de entidades (en Spring Boot, que esté bajo el paquete de la aplicación o indicado con `@EntityScan`).
4. Revisa el registro de avisos y errores: señala los mapeos que necesitan atención.

## Decisiones de mapeo

- **Nombres.** Clases en PascalCase y campos en camelCase a partir de los nombres SQL (`purchase_order` → `PurchaseOrder`, `customer_id` → `customerId`; los nombres en MAYÚSCULAS de Oracle se pasan antes a minúsculas). Las tablas cuyo nombre es una palabra reservada de Java (`class`) generan una clase con el sufijo `Entity` (`ClassEntity`), sin aplicar el singular; lo mismo las clases que coinciden con tipos usados en el código (`Table`, `List`…). Los campos que coinciden con palabras reservadas llevan un `_` final.
- **Singular y plural.** Se aplica una regla simple: quitar o poner una `s` final (`users` → `User`, `purchase_order` → `purchaseOrders`). No se aplican reglas ortográficas, así que `categories` da `Categorie`.
- **Atributos de relación.** Se llaman como la tabla relacionada: en singular para un objeto (`customer`) y en plural para una colección (`purchaseOrders`). Si dos atributos se llamarían igual (por ejemplo, dos claves foráneas hacia la misma tabla), se les añade el nombre de la columna de la clave foránea sin `_id` (`userCreatedBy`, `documentsCreatedBy`); si aún coinciden, un número.
- **Nombres físicos.** `@Table` y `@Column` llevan siempre el nombre de la base de datos, para no depender de la estrategia de nombres del proveedor.
- **Autoincremento.** `@GeneratedValue(strategy = GenerationType.IDENTITY)`. Las secuencias (`seq.NEXTVAL`, `nextval(...)`, triggers de Oracle) también se mapean como `IDENTITY`: el uso de `GenerationType.SEQUENCE` está pendiente.
- **Claves compuestas.** `@IdClass` con una clase `XxxId` (`Serializable`, con `equals` y `hashCode`).
- **Columnas compartidas.** Una columna solo la escribe un mapeo. Si una relación usa columnas de la clave primaria o de otra relación, se mapea en solo lectura (`insertable = false, updatable = false`) y la columna se asigna mediante el campo `@Id` o el campo correspondiente.
- **Relaciones.** `@ManyToOne` y `@OneToOne` con `FetchType.LAZY` y sin `cascade`. Los lados inversos se generan siempre: `List` para `@OneToMany` y `Set` para `@ManyToMany`. Las tablas intermedias puras no generan clase: se mapean con `@ManyToMany` y `@JoinTable`.
- **Tipos.** Siempre clases envoltorio (`Integer`, `Long`…). Fechas con `java.time`. Los ENUM cuyos valores son identificadores Java válidos se generan como `enum` anidado con `@Enumerated(EnumType.STRING)`; el resto, como `String`. Los tipos sin equivalente, como `String` con aviso. `@Lob` solo para CLOB, BLOB y los TEXT/BLOB grandes de MySQL.
- **Valores por defecto.** Los `DEFAULT` del script no se trasladan: JPA no tiene una forma portable de declararlos.
- **Tablas sin clave primaria.** Se generan sin `@Id` y con un aviso: JPA lo exige y hay que añadirlo a mano.

## Registro de avisos y errores

4 aviso(s) y 0 error(es). La posición (línea:columna) se refiere al script original; los avisos de la inferencia y de la generación no tienen posición porque se producen sobre el modelo.

| Etapa | Tipo | Código | Mensaje | Fragmento | Posición |
| --- | --- | --- | --- | --- | --- |
| Análisis | Aviso | `parser.unknown-column-type` | Tipo "INTERVAL DAY(3) TO SECOND(0)" no reconocido en "audit_log.retention"; se tratará como un tipo genérico. | `retention   INTERVAL DAY(3) TO SECOND(0)` | 28:3 |
| Análisis | Aviso | `parser.unsupported-statement` | Sentencia no soportada; se ignora. | `CREATE OR REPLACE PACKAGE customer_api AS   PROCEDURE register(p_name IN VARCHAR2);   FUNCTION find(p_id IN NUMBER) RETURN VARCHAR2; END customer_api;` | 66:1 |
| Análisis | Aviso | `parser.unsupported-statement` | Sentencia no soportada; se ignora. | `BEGIN   EXECUTE IMMEDIATE 'CREATE TABLE tmp_import (id NUMBER)'; END;` | 76:1 |
| Generación | Aviso | `jpa.unmapped-type` | El tipo "INTERVAL DAY(3) TO SECOND(0)" de "audit_log.retention" no tiene equivalente Java; se mapea como String. | `retention INTERVAL DAY(3) TO SECOND(0)` | — |
