# AGENTS.md — SQLPARSER

Guía para agentes de IA (y personas) que trabajan en este repositorio. Léela entera antes de tocar código. La fuente de verdad funcional es [project-spec.md](docs/project-spec.md); si este documento y la spec se contradicen, manda la spec y hay que actualizar este fichero.

## Qué es el proyecto

SQLPARSER es una aplicación web **100 % cliente** que convierte scripts SQL DDL en clases de entidad ORM (JPA en el MVP), infiere las relaciones entre entidades, muestra una previsualización con resaltado de sintaxis y permite descargar un ZIP con las clases y un README.

Principios que no se negocian:

- **Client-only.** No hay backend, base de datos ni servicios externos. Todo se ejecuta en el navegador.
- **El script SQL nunca sale del equipo del usuario.** Ninguna llamada de red durante el uso.
- **KISS.** Cualquier cosa que requiera servidor queda fuera del MVP.
- **Extensibilidad sin sobrecarga.** Añadir un ORM nuevo = añadir un generador. Nunca modificar el parser ni el modelo de esquema para ello.

## Stack

| Capa       | Tecnología                  |
| ---------- | --------------------------- |
| Lenguaje   | TypeScript (modo `strict`)  |
| UI         | React                       |
| Build      | Vite                        |
| Parseo SQL | `@khanakia/sql-schema-core` |
| ZIP        | JSZip + FileSaver           |
| Estilos    | Tailwind CSS                |
| Despliegue | Vercel (estático)           |
| Tests      | Vitest + Testing Library    |
| Lint       | ESLint + typescript-eslint  |

No añadas dependencias fuera de esta tabla sin justificarlo. Antes de añadir una, comprueba que:

1. Funciona en el navegador sin servidor.
2. No hace llamadas de red en tiempo de ejecución (ni telemetría, ni CDNs, ni fuentes remotas).
3. No existe ya algo en el stack que resuelva el problema.

Decisión aún abierta (consultar antes de elegir): librería de resaltado de sintaxis para la previsualización.

## Comandos

Requiere Node ≥ 20.19.

```bash
npm install          # instalar dependencias
npm run dev          # servidor de desarrollo de Vite (http://localhost:5173)
npm run build        # type-check (tsc -b) + build de producción en dist/
npm run preview      # servir el build localmente
npm run lint         # ESLint
npm run test         # tests unitarios (vitest run)
npm run test:watch   # tests en modo watch
```

Antes de dar una tarea por terminada: `lint`, `test` y `build` deben pasar sin errores.

### Configuración relevante

- `vite.config.ts` — plugins (React, Tailwind v4 vía `@tailwindcss/vite`), alias `@/` y configuración de Vitest.
- `eslint.config.js` — además de las reglas habituales, **hace cumplir las reglas de dependencia y privacidad** de este documento (`no-restricted-imports` por carpeta, `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon` prohibidos en `src/`, `window`/`document` prohibidos en `core/`, `@khanakia/*` solo en `core/parser/`). Si cambias las reglas de dependencia aquí, actualiza también ese fichero.
- `vercel.json` — cabeceras de seguridad; la CSP incluye `connect-src 'none'`, así que cualquier llamada de red se bloquea también en producción.
- Tailwind v4 no necesita `tailwind.config`; los estilos globales viven en `src/index.css`.

## Estructura de carpetas

```
src/
├── core/                 # Núcleo de negocio (sin dependencia de framework UI)
│   ├── parser/           # Entrada SQL → modelo AST
│   ├── model/            # Definición del modelo de esquema
│   ├── inference/        # Inferencia de relaciones
│   └── generators/       # Salida del generador
│       └── jpa/          # Generador JPA
├── components/           # Componentes UI reutilizables (puros, sin lógica de negocio)
├── features/             # Características a nivel de página
│   └── converter/        # La característica principal: pegar SQL, previsualizar, descargar
│       ├── ConverterPage.tsx
│       ├── hooks/
│       └── components/
├── hooks/                # Hooks comunes entre características
├── utils/                # Funciones de utilidad puras
├── types/                # Tipos TypeScript globales
└── context/              # Contexto de react (si es necesario)
```

Los ficheros de arranque, configuración y enrutamiento (`main.tsx`, `App.tsx`, rutas, estilos globales de Tailwind) viven directamente en la raíz de `src/`.

### Responsabilidad de cada carpeta

- **`core/parser/`** — Detección de dialecto y parseo del DDL. Es el **único** lugar donde se importa `@khanakia/sql-schema-core`. Actúa como adaptador: traduce la salida de la librería al modelo propio de `core/model/` y emite diagnósticos (avisos/errores) con el fragmento SQL problemático.
- **`core/model/`** — Tipos y estructuras del esquema independientes de la librería de parseo y del ORM: tablas, columnas (tipo, nulabilidad, valor por defecto, comentario), claves primarias simples y compuestas, claves foráneas, restricciones únicas, relaciones y diagnósticos.
- **`core/inference/`** — Recibe el modelo de esquema y devuelve el modelo enriquecido con relaciones. No sabe nada de JPA ni de ningún ORM.
- **`core/generators/`** — Contrato común de generador y una subcarpeta por ORM. `jpa/` genera clases Java con anotaciones Jakarta y Lombok opcional. Cada generador también aporta su parte del README.
- **`components/`** — Piezas visuales reutilizables (botones, paneles, editor, visor de código, lista de diagnósticos…). Reciben datos por props y emiten eventos. Sin lógica de negocio, sin importar `core/`.
- **`features/converter/`** — Orquesta el flujo: entrada del script, configuración, previsualización, avisos y descarga. `hooks/` contiene los hooks propios de la feature (p. ej. ejecutar el pipeline, estado de configuración); `components/` los componentes que solo tienen sentido aquí.
- **`hooks/`** — Hooks reutilizables por más de una feature (debounce, carga de fichero, etc.).
- **`utils/`** — Funciones puras y sin estado (conversión de nombres, pluralización, construcción del ZIP…). Sin React.
- **`types/`** — Tipos globales compartidos que no pertenecen al dominio del esquema (el dominio vive en `core/model/`).
- **`context/`** — Solo si el estado realmente necesita compartirse entre ramas lejanas del árbol. Por defecto, estado local + props.

### Reglas de dependencia

Las flechas indican "puede importar de":

```
features ──► components, hooks, context, core, utils, types
hooks    ──► core, utils, types
components ► utils, types                (nunca core ni features)
core/*   ──► core/model, utils, types    (nunca React, components, features, hooks, context)
utils    ──► types
```

Dentro de `core/`:

- `parser`, `inference` y `generators` dependen de `model`; `model` no depende de ninguno.
- `generators` **no** importa de `parser` ni de la librería de parseo. Solo consume el modelo enriquecido.
- `inference` no importa de `generators`.
- Un generador nunca importa de otro generador.

`core/` debe ser TypeScript puro: sin DOM, sin `window`, sin `fetch`, sin efectos secundarios. Así se puede testear aislado y ejecutar dentro de un Web Worker sin cambios.

## Pipeline de procesamiento

```
script SQL (string)
  └─► core/parser      detectar dialecto (o usar el indicado por el usuario) → parsear
        └─► SchemaModel + diagnósticos
              └─► core/inference   inferir relaciones
                    └─► SchemaModel enriquecido
                          └─► core/generators/<orm>   generate(schema, opciones)
                                └─► ficheros generados (ruta + contenido) + README
                                      └─► previsualización / ZIP
```

Cada etapa es una función pura: misma entrada ⇒ misma salida. Los diagnósticos se acumulan a lo largo del pipeline y se devuelven junto al resultado; nunca se lanzan excepciones para comunicar problemas del script del usuario.

### Diagnósticos (avisos y errores)

- **Aviso**: el proceso continúa (sentencia no soportada, tabla o columna parcialmente interpretable). Se genera igualmente.
- **Error**: el proceso no puede continuar (sintaxis inválida que impide obtener un esquema). No se genera.
- Todo diagnóstico incluye **mensaje + fragmento SQL problemático** (y posición si la librería la proporciona). Un mensaje sin fragmento no es aceptable.
- Una sentencia no soportada nunca debe abortar el análisis del resto del script.

### Inferencia de relaciones

Reglas base (documentar en el README generado cualquier decisión aplicada):

| Situación en el esquema                                                  | Resultado                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| FK en tabla A → tabla B                                                  | `@ManyToOne` en A, `@OneToMany` inverso en B                                      |
| FK con restricción `UNIQUE` (o FK que es a la vez la PK)                 | `@OneToOne`                                                                       |
| Tabla con PK compuesta formada exactamente por dos FK y sin más columnas | Tabla intermedia pura → `@ManyToMany` entre las dos entidades, sin entidad propia |
| Tabla con PK compuesta de dos FK **y** columnas propias                  | Entidad de asociación con clave compuesta y dos `@ManyToOne`                      |

La inferencia produce relaciones en el modelo, no anotaciones. Traducirlas a anotaciones es trabajo del generador.

### Contrato de generador

Todo ORM se implementa como un generador que cumple la interfaz común de [`core/generators/generator.ts`](src/core/generators/generator.ts):

```ts
interface Generator<TOptions extends object> {
  id: string; // p. ej. "jpa"
  label: string; // nombre visible en la UI
  defaultOptions: TOptions; // valores por defecto sensatos (serializables)
  generate(schema: EnrichedSchemaModel, options: TOptions): GenerationResult;
}

interface GenerationResult {
  files: { path: string; content: string; language: string }[]; // incluye README
  diagnostics: Diagnostic[];
}
```

### Modelo de esquema (`core/model/`)

- `SchemaModel` es la salida del parser; `EnrichedSchemaModel` (tablas con `kind` + `relationships`) la de la inferencia y la entrada de los generadores.
- PK, UNIQUE y FK se representan **solo como restricciones** de la tabla (con lista de columnas, para cubrir las compuestas); las columnas no llevan flags `pk`/`unique`.
- Cada columna tiene un `LogicalType` independiente del dialecto que rellena el parser; los generadores mapean desde él, no desde el tipo SQL en bruto.
- Las relaciones son una unión discriminada por `kind` (`many-to-one`, `one-to-one`, `many-to-many`). El `one-to-many` es el lado inverso de `many-to-one` y lo emite el generador. Cada relación indica la `rule` de inferencia aplicada, que sirve para el README.
- `Diagnostic.code` es un `string` con espacio de nombres (`parser.*`, `inference.*`, `<generador>.*`) para que un generador nuevo defina sus códigos sin tocar el modelo.

Para añadir un ORM nuevo: crear `core/generators/<orm>/`, implementar la interfaz y registrarlo en el registro de generadores. Si para ello necesitas tocar `parser/`, `model/` o `inference/`, detente y replantea el diseño.

## Configuración de la generación

Opciones del MVP: framework ORM (JPA), paquete base, librería de anotaciones (Jakarta), Lombok sí/no, estrategia de nombres de clase (singular/plural, capitalización) y dialecto SQL manual.

- Los valores por defecto viven en un único sitio por generador (`defaultOptions`). El usuario debe poder generar **sin tocar nada** y obtener un resultado útil.
- Cambiar cualquier opción **regenera automáticamente** la previsualización (con debounce para no bloquear la UI).
- Sustituir el script **no** reinicia la configuración ni recarga la página.

## Rendimiento

- Análisis + generación < 2 s para scripts de hasta 100 tablas.
- La UI nunca se congela. Si un script es grande, el pipeline se ejecuta en un Web Worker (por eso `core/` debe ser puro y sus entradas/salidas serializables).
- Sin límite artificial de tamaño del script.

## Privacidad y seguridad

Prohibido, sin excepciones en el MVP:

- Cualquier `fetch`, `XMLHttpRequest`, WebSocket o `sendBeacon` en tiempo de ejecución.
- Analítica, telemetría, trackers o cookies de seguimiento (ni siquiera con consentimiento).
- Recursos remotos en tiempo de ejecución (CDNs, Google Fonts…): todo se empaqueta con Vite.
- Registro, login o almacenamiento de datos de usuario.
- Enviar el contenido del script a cualquier sitio, también en logs o mensajes de error.

## Convenciones de código

- TypeScript `strict`; nada de `any` salvo en el adaptador de la librería de parseo y con comentario justificándolo.
- Componentes React funcionales con hooks. Un componente por fichero, nombre en `PascalCase.tsx`.
- Hooks: `useAlgo.ts`. Utilidades y módulos de `core`: `camelCase.ts`.
- Estilos solo con clases de Tailwind; nada de CSS inline salvo valores dinámicos.
- Preferir funciones puras y datos inmutables, especialmente en `core/`.
- Imports con alias `@/` apuntando a `src/` (configurado en `vite.config.ts` y `tsconfig.app.json`).
- Nombres de código (variables, funciones, tipos) en inglés; textos de UI según decida el proyecto, centralizados si se prevé traducción.
- La UI debe ser responsive para resoluciones de escritorio estándar; el móvil no es objetivo.
- Navegadores objetivo: últimas dos versiones de Chrome, Firefox, Safari y Edge (ES2020+).

## Tests

- `core/` es donde está el valor: cada parser, regla de inferencia y generador lleva tests unitarios.
- Tests junto al código (`algo.test.ts`). Fixtures SQL en `__fixtures__/` dentro del módulo que las usa.
- El entorno por defecto de Vitest es **Node** (así se garantiza que `core/` no depende del DOM). Los tests de UI activan jsdom con el docblock `// @vitest-environment jsdom` en la primera línea. Los matchers de `@testing-library/jest-dom` se cargan globalmente desde `vitest.setup.ts`.
- Para los generadores, comparar la salida contra ficheros esperados (snapshot o golden files) a partir de scripts SQL reales.
- Cubrir siempre los casos de la tabla de relaciones y las ramas de error de la spec: script inválido (error), sentencias no soportadas (aviso), dialecto no detectado.
- Los componentes de `components/` se testean por comportamiento, no por implementación.

## Flujo de trabajo para agentes

1. Lee la spec y la sección relevante de este documento antes de proponer cambios.
2. Respeta las reglas de dependencia; si un cambio las rompe, propón otra solución antes de escribir código.
3. Cambios pequeños y enfocados. No refactorices lo que no te han pedido.
4. Añade o actualiza tests con cada cambio en `core/`.
5. Ejecuta `lint`, `test` y `build` antes de terminar e informa del resultado real.
6. Si cambia la arquitectura, los comandos o una convención, actualiza este `AGENTS.md` en el mismo cambio.

## Fuera del alcance del MVP

- ORMs distintos de JPA y librerías de anotaciones distintas de Jakarta (el diseño debe permitirlos, pero no se implementan).
- Cualquier backend, API, persistencia en servidor o autenticación.
- Telemetría de cualquier tipo.
- Soporte móvil específico.
