## Visión del Producto

SQLPARSER es una herramienta web que convierte scripts SQL DDL en código de entidades para distintos frameworks ORM, generando un paquete descargable con las clases anotadas y las relaciones inferidas. Está dirigida a desarrolladores backend que necesitan arrancar proyectos sin escribir el mapeo objeto-relacional a mano. Resuelve la pérdida de tiempo y los errores manuales que supone traducir un esquema de base de datos a código de persistencia.

## Usuarios y casos de uso

### Usuario principal

Desarrollador backend que arranca un proyecto desde un esquema SQL existente.

### Casos de uso

- Generar paquete de entidades apartir de script SQL
- Configurar las opciones de generación
- Seleccionar el framework ORM destino
- Previsualizar el código generado antes de descargarlo
- Descargar el paquete generado
- Revisar los avisos y errores del análisis

## Funcionalidades

### Entrada del script SQL

1. El usuario puede pegar un script SQL DDL o subir un archivo `.sql` desde su equipo en un área de texto de la interfaz.
2. El sistema permite identificar el dialecto SQL del script a partir de su sintaxis, o aceptar que el usuario lo indique manualmente.
3. El usuario puede sustituir el script sin recargar la página y sin perder la configuración

### Análisis del esquema

4. El sistema permite extraer las tablas definidas en el script.
5. El sistema permite extraer las columnas de cada tabla, con su tipo, nulabilidad, valor por defecto y comentario si existe.
6. El sistema permite extraer las claves primarias, tanto simples como compuestas.
7. El sistema permite extraer las claves foráneas y las tablas a las que referencian.
8. El sistema permite inferir las relaciones entre entidades (`@OneToOne`, `@OneToMany`, `@ManyToOne`, `@ManyToMany`) a partir de las claves foráneas y las restricciones únicas.
9. El sistema permite detectar tablas intermedias con clave primaria compuesta formada por dos claves foráneas, y distinguir si son relaciones puras o entidades con atributos propios.

### Configuración de la generación

10. El usuario puede seleccionar el framework ORM destino (JPA en el MVP).
11. El usuario puede indicar el paquete base de las clases generadas.
12. El usuario puede elegir la librería para las anotaciones (Jakarta en el MVP).
13. El usuario puede activar o desactivar el uso de Lombok en las clases generadas.
14. El usuario puede elegir la estrategia de nombres de las clases (singular/plural, capitalización).
15. El usuario puede indicar manualmente el dialecto SQL del script si la detección automática falla.
16. El sistema permite aplicar valores por defecto sensatos a todas las opciones de configuración, de modo que el usuario pueda generar sin configurar nada.

### Generación y previsualización

17. El usuario puede generar las clases de entidad a partir del esquema analizado y la configuración elegida.
18. El usuario puede previsualizar el código generado de cada clase antes de descargarlo.
19. El usuario puede navegar entre las clases generadas en la previsualización.
20. El sistema vuelve a generar al cambiar una opción.

### Descarga del resultado

21. El usuario puede descargar un paquete ZIP con todas las clases generadas.
22. El sistema permite incluir un archivo README en el resultado de la generación con las instrucciones de integración y las decisiones de mapeo aplicadas.

### Avisos y errores

23. El sistema permite detectar sentencias SQL no soportadas e informar al usuario sin interrumpir el proceso.
24. El sistema permite señalar tablas o columnas que no se han podido interpretar, indicando el fragmento problemático.
25. El sistema permite distinguir entre avisos (el proceso continúa) y errores (el proceso no puede continuar).
26. El usuario puede revisar la lista de avisos y errores generados durante la previsualización.

### Privacidad y entorno

27. El sistema permite procesar el script íntegramente en el navegador, sin enviar datos a ningún servidor.
28. El sistema permite funcionar sin registro ni autenticación.

## Flujos de Usuario

### 1. Generación de ficheros ORM a partir de un script SQL

#### Happy Path

1. El usuario accede a la herramienta.
2. El usuario introduce un script SQL DDL, ya sea pegándolo en el área de texto o subiendo un archivo `.sql`.
3. El sistema detecta el dialecto SQL del script.
   - **Variación A**
   - **Variación C**
4. El sistema analiza el esquema y extrae tablas, columnas, tipos, claves primarias, claves foráneas y restricciones.
   - **Variación B**
5. El sistema infiere las relaciones entre entidades.
6. El sistema aplica la configuración por defecto (o la que el usuario haya ajustado).
7. El sistema genera las clases de entidad para el ORM destino.
8. El usuario previsualiza el código generado.
   - **Variación D**
9. El usuario descarga un paquete ZIP con las clases y el README.
10. El flujo termina.

#### Ramas de error y variación

| RAMA                              | Cuándo ocurre                                                                    | Qué hace el sistema                                  | Cómo se reconduce                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A. Error bloqueante en el script  | El script tiene sintaxis inválida o no se puede analizar                         | Informa del error con el fragmento problemático      | El usuario corrige el script y sustituye la entrada. Vuelve al paso 2               |
| B. Aviso no bloqueante            | El script contiene sentencias no soportadas o tablas parcialmente interpretables | Genera igualmente y muestra la lista de avisos       | El usuario decide si le basta o corrige el script. Vuelve al paso 2 o continúa al 8 |
| C. Detección de dialecto fallida  | El sistema no reconoce el dialecto o el usuario sospecha que se ha detectado mal | Permite al usuario indicar el dialecto manualmente   | Vuelve al paso 4 con el dialecto corregido                                          |
| D. Configuración no satisfactoria | El usuario previsualiza y no le convence el resultado                            | Regenera automáticamente al cambiar cualquier opción | Vuelve al paso 6 con la nueva configuración                                         |

## Arquitectura

SQLPARSER es una aplicación web cliente-only. Toda la lógica de análisis, transformación y generación se ejecuta en el navegador del usuario. No existe backend, base de datos ni servicio externo. La aplicación se sirve como un conjunto de archivos estáticos y funciona íntegramente en el equipo del usuario.

### Stack Tecnológico

| Capa           | Tecnología                | Motivo                                           |
| -------------- | ------------------------- | ------------------------------------------------ |
| Lenguaje       | TypeScript                | Tipado, mantenibilidad                           |
| Framework UI   | React                     | Ecosistema, familiaridad                         |
| Empaquetado    | Vite                      | Rapidez, simplicidad                             |
| Parseo SQL     | @khanakia/sql-schema-core | Alta tolerancia a errores y mantenimiento activo |
| Generación ZIP | JSZip + FileSaver         | Estándar de facto                                |
| Estilos        | Tailwind CSS              | Ordenado y customizable                          |
| Despliegue     | Vercel                    | Gratuito                                         |

## Requisitos no funcionales

### Filosofía de diseño

- **KISS**: Toda funcionalidad que requiera backend, base de datos o servicio externo queda fuera del MVP.
- **Client-Only**: Es sistema debe de funcionar integramente en el navegador, sin servidor.
- **Extensibilidad sin sobrecarga:** añadir un nuevo ORM destino no debe requerir modificar el núcleo del parser ni del modelo de esquema.

### Privacidad y seguridad

- **El script SQL nunca abandona el equipo del usuario.** No se envía a ningún servidor, ni siquiera de forma anónima.
- **Sin telemetría por defecto.** No se recogen métricas de uso sin consentimiento explícito. En el MVP, ni siquiera con consentimiento.
- **Sin registro ni autenticación.** No hay cuentas, no hay datos de usuario, no hay nada que proteger.
- **Sin cookies de seguimiento.** Solo las estrictamente necesarias para el funcionamiento (si hubiera alguna).

### Rendimiento

- **Tiempo de análisis y generación inferior a 2 segundos** para scripts de hasta 100 tablas.
- **La interfaz debe permanecer interactiva** durante el análisis. Si el script es grande, se puede usar un Web Worker, pero el usuario nunca debe ver la pestaña congelada.
- **Sin límite artificial de tamaño de script**, más allá de lo que el navegador pueda manejar.
- **Sin llamadas de red durante el uso.** Todo el procesamiento es local.

### Usabilidad

- **El usuario debe poder generar entidades sin configurar nada.** Los valores por defecto deben producir un resultado útil.
- **La previsualización debe mostrar el código con resaltado de sintaxis** para facilitar la lectura.
- **Los avisos y errores deben indicar el fragmento problemático**, no solo el mensaje.
- **La interfaz debe ser responsive** y funcionar en resoluciones de escritorio estándar (el target es desarrollador backend, no móvil).
- **Sin curva de aprendizaje:** un desarrollador familiarizado con ORMs debe poder usar la herramienta sin leer documentación.

### Compatibilidad

- **Navegadores soportados:** últimas dos versiones de Chrome, Firefox, Safari y Edge.
- **Sin soporte para Internet Explorer** ni navegadores sin soporte de ES2020.
- **Sistemas operativos:** cualquiera con un navegador moderno. No hay dependencia de sistema operativo.
- **Dialectos SQL soportados en el MVP:** MySQL, PostgreSQL, SQLite y Oracle. El análisis se apoya en @khanakia/sql-schema-core y lo completa donde la librería no llega (por ejemplo, la sintaxis de Oracle y SQL*Plus). Cualquier funcionalidad nueva debe funcionar con los cuatro.

## Historias de Usuario MVP

### US-01

- **Descripción**: Como desarrollador backend, quiero generar clases de entidad JPA a partir de un script SQL, para no escribirlas a mano
- **Prioridad**: Alta
- **Criterios de Aceptación**:
  - Dado un script con una tabla sin relaciones, se genera una clase con `@Entity`, `@Id` y `@Column`.
  - Dado un script con dos tablas relacionadas por FK, se generan dos clases con `@ManyToOne` y `@OneToMany`.
  - Dado un script con una relación uno a uno, se genera `@OneToOne`.
  - Dado un script con una tabla intermedia con dos FK, se detecta y se genera `@ManyToMany`.
  - Dado un script con una tabla intermedia con atributos propios, se genera una entidad propia con dos `@ManyToOne`.
  - Dado un script con claves primarias compuestas, se genera `@IdClass` o `@EmbeddedId`.
- **Tareas**:
  - [ ] Definir el modelo de esquema.
  - [ ] Implementar el análisis del script (tablas, columnas, PK, FK, restricciones).
  - [ ] Implementar la inferencia de relaciones.
  - [ ] Implementar el generador JPA.
  - [ ] Montar la UI mínima para ver el resultado.
  - [ ] Escribir tests.
  - [ ] Probar el flujo completo.

### Futuras Historias de usuario

| Código | Descripción                                                                                                                        | Prioridad |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| US-02  | Como desarrollador backend, quiero ajustar las opciones de generación, para adaptar el código a las convenciones de mi proyecto    | Baja      |
| US-03  | Como desarrollador backend, quiero previsualizar el código antes de descargarlo, para confiar en el resultado                      | Alta      |
| US-04  | Como desarrollador backend, quiero saber qué partes del script no se han podido interpretar, para decidir si me sirve el resultado | Alta      |
| US-05  | Como desarrollador backend, quiero corregir el script y volver a generar sin perder la configuración, para iterar rápido           | Baja      |
| US-06  | Como desarrollador backend, quiero descargar el resultado como ZIP, para integrarlo en mi proyecto                                 | Alta      |
