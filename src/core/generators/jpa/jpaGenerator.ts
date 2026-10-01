import type { Diagnostic } from '@/core/model';
import { EMPTY_GENERATION_CONTEXT, type GeneratedFile, type Generator } from '../generator';
import { JPA_DIAGNOSTICS } from './diagnosticCodes';
import { isValidPackageName } from './javaNames';
import { JPA_DEFAULT_OPTIONS, type JpaOptions } from './jpaOptions';
import { README_PATH, renderJpaReadme } from './jpaReadme';
import { planEntities } from './planEntities';
import { renderEntity, renderIdClass } from './renderJava';

/**
 * Generador JPA: una clase `@Entity` por tabla (salvo las tablas intermedias
 * puras), una clase `XxxId` por clave compuesta y un README. Anotaciones
 * Jakarta Persistence; sin Lombok todavía.
 */
export const jpaGenerator: Generator<JpaOptions> = {
  id: 'jpa',
  label: 'JPA (Jakarta Persistence)',
  defaultOptions: JPA_DEFAULT_OPTIONS,

  generate(schema, options, context = EMPTY_GENERATION_CONTEXT) {
    const diagnostics: Diagnostic[] = [];

    let packageName = options.basePackage.trim();
    if (!isValidPackageName(packageName)) {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.invalidPackage,
        message: `"${options.basePackage}" no es un paquete Java válido; se usa ${JPA_DEFAULT_OPTIONS.basePackage}.`,
        fragment: `basePackage = "${options.basePackage}"`,
      });
      packageName = JPA_DEFAULT_OPTIONS.basePackage;
    }
    if (options.useLombok) {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.lombokNotSupported,
        message: 'Lombok todavía no está implementado: se generan getters y setters.',
        fragment: 'useLombok = true',
      });
    }

    const plan = planEntities(schema, options);
    diagnostics.push(...plan.diagnostics);

    const directory = packageName ? `src/main/java/${packageName.replace(/\./g, '/')}/` : 'src/main/java/';
    const javaFiles: GeneratedFile[] = plan.entities.flatMap((entity) => [
      { path: `${directory}${entity.className}.java`, content: renderEntity(entity, packageName), language: 'java' },
      ...(entity.idClass
        ? [{ path: `${directory}${entity.idClass.className}.java`, content: renderIdClass(entity.idClass, packageName), language: 'java' }]
        : []),
    ]);

    const readme: GeneratedFile = {
      path: README_PATH,
      language: 'markdown',
      content: renderJpaReadme({
        schema,
        options,
        packageName,
        plan,
        files: javaFiles,
        diagnostics: [...context.diagnostics, ...diagnostics],
        dialect: context.dialect,
      }),
    };

    return { files: [...javaFiles, readme], diagnostics };
  },
};
