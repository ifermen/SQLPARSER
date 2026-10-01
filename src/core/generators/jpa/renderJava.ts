import { capitalize } from '@/utils/naming';
import type { PlannedEntity, PlannedField, PlannedIdClass } from './planEntities';

/**
 * Fase 2 del generador: convierte las clases planificadas en código Java.
 * Formato: sangría de 4 espacios, imports agrupados (`jakarta.*` y `java.*`),
 * campos, getters y setters. Sin Lombok.
 */

const INDENT = '    ';

export function renderEntity(entity: PlannedEntity, packageName: string): string {
  const lines: string[] = [...header(packageName, entity.imports)];
  lines.push(...javadoc(entity.javadoc, ''));
  lines.push(...entity.annotations);
  lines.push(`public class ${entity.className} {`);

  for (const plannedEnum of entity.enums) {
    lines.push('', `${INDENT}public enum ${plannedEnum.name} {`, `${INDENT}${INDENT}${plannedEnum.constants.join(', ')}`, `${INDENT}}`);
  }
  for (const field of entity.fields) lines.push('', ...fieldDeclaration(field));
  for (const field of entity.fields) lines.push('', ...accessors(field));

  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function renderIdClass(idClass: PlannedIdClass, packageName: string): string {
  const hasArrays = idClass.fields.some((field) => field.javaType.endsWith('[]'));
  const imports = ['java.io.Serializable', 'java.util.Objects', ...idClass.imports, ...(hasArrays ? ['java.util.Arrays'] : [])];
  const fieldNames = new Set(idClass.fields.map((field) => field.name));
  const parameter = freeName(['other', 'object', 'candidate'], fieldNames);
  const local = freeName(['that', 'otherId', 'key'], fieldNames);
  const { className } = idClass;

  const lines: string[] = [...header(packageName, imports)];
  lines.push(
    ...javadoc([`Clave primaria compuesta de {@link ${idClass.entityClassName}} (se usa con {@code @IdClass}).`], ''),
    `public class ${className} implements Serializable {`,
    '',
    `${INDENT}private static final long serialVersionUID = 1L;`,
  );
  for (const field of idClass.fields) lines.push('', `${INDENT}private ${field.javaType} ${field.name};`);

  lines.push('', `${INDENT}public ${className}() {`, `${INDENT}}`);
  const parameters = idClass.fields.map((field) => `${field.javaType} ${field.name}`).join(', ');
  lines.push('', `${INDENT}public ${className}(${parameters}) {`);
  for (const field of idClass.fields) lines.push(`${INDENT}${INDENT}this.${field.name} = ${field.name};`);
  lines.push(`${INDENT}}`);

  for (const field of idClass.fields) lines.push('', ...accessors(field));

  const comparisons = idClass.fields.map((field) =>
    field.javaType.endsWith('[]')
      ? `Arrays.equals(${field.name}, ${local}.${field.name})`
      : `Objects.equals(${field.name}, ${local}.${field.name})`,
  );
  lines.push(
    '',
    `${INDENT}@Override`,
    `${INDENT}public boolean equals(Object ${parameter}) {`,
    `${INDENT}${INDENT}if (this == ${parameter}) {`,
    `${INDENT}${INDENT}${INDENT}return true;`,
    `${INDENT}${INDENT}}`,
    `${INDENT}${INDENT}if (!(${parameter} instanceof ${className})) {`,
    `${INDENT}${INDENT}${INDENT}return false;`,
    `${INDENT}${INDENT}}`,
    `${INDENT}${INDENT}${className} ${local} = (${className}) ${parameter};`,
    `${INDENT}${INDENT}return ${comparisons.join(`\n${INDENT}${INDENT}${INDENT}${INDENT}&& `)};`,
    `${INDENT}}`,
  );

  const hashed = idClass.fields.filter((field) => !field.javaType.endsWith('[]')).map((field) => field.name);
  const arrays = idClass.fields.filter((field) => field.javaType.endsWith('[]')).map((field) => field.name);
  lines.push('', `${INDENT}@Override`, `${INDENT}public int hashCode() {`);
  if (arrays.length === 0) {
    lines.push(`${INDENT}${INDENT}return Objects.hash(${hashed.join(', ')});`);
  } else {
    lines.push(`${INDENT}${INDENT}int result = Objects.hash(${hashed.join(', ')});`);
    for (const name of arrays) lines.push(`${INDENT}${INDENT}result = 31 * result + Arrays.hashCode(${name});`);
    lines.push(`${INDENT}${INDENT}return result;`);
  }
  lines.push(`${INDENT}}`, '}');
  return `${lines.join('\n')}\n`;
}

function header(packageName: string, imports: readonly string[]): string[] {
  const unique = [...new Set(imports)].sort();
  const groups = [unique.filter((name) => !name.startsWith('java.')), unique.filter((name) => name.startsWith('java.'))]
    .filter((group) => group.length > 0)
    .map((group) => group.map((name) => `import ${name};`).join('\n'));

  const lines: string[] = [];
  if (packageName) lines.push(`package ${packageName};`, '');
  if (groups.length > 0) lines.push(groups.join('\n\n'), '');
  return lines;
}

function javadoc(paragraphs: readonly string[], indent: string): string[] {
  if (paragraphs.length === 0) return [];
  const body = paragraphs.flatMap((paragraph, index) => [
    ...(index > 0 ? [`${indent} * <p>`] : []),
    `${indent} * ${paragraph}`,
  ]);
  return [`${indent}/**`, ...body, `${indent} */`];
}

function fieldDeclaration(field: PlannedField): string[] {
  const annotationLines = field.annotations.flatMap((annotation) =>
    annotation.split('\n').map((line) => `${INDENT}${line}`),
  );
  const initializer = field.initializer ? ` = ${field.initializer}` : '';
  return [
    ...javadoc(field.javadoc ? [field.javadoc] : [], INDENT),
    ...annotationLines,
    `${INDENT}private ${field.javaType} ${field.name}${initializer};`,
  ];
}

function accessors(field: Pick<PlannedField, 'name' | 'javaType'>): string[] {
  const property = capitalize(field.name);
  return [
    `${INDENT}public ${field.javaType} get${property}() {`,
    `${INDENT}${INDENT}return ${field.name};`,
    `${INDENT}}`,
    '',
    `${INDENT}public void set${property}(${field.javaType} ${field.name}) {`,
    `${INDENT}${INDENT}this.${field.name} = ${field.name};`,
    `${INDENT}}`,
  ];
}

function freeName(candidates: readonly string[], taken: ReadonlySet<string>): string {
  return candidates.find((candidate) => !taken.has(candidate)) ?? `${candidates[0] ?? 'value'}Value`;
}
