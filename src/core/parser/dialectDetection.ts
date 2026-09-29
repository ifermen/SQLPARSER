import type { SqlDialect } from '@/core/model';

interface DialectMarker {
  readonly dialect: SqlDialect;
  readonly pattern: RegExp;
  readonly weight: number;
}

/**
 * Rasgos de sintaxis propios de cada dialecto. Cada rasgo presente suma su peso
 * una sola vez, así el resultado no depende del tamaño del script.
 */
const MARKERS: readonly DialectMarker[] = [
  { dialect: 'mysql', pattern: /`/, weight: 2 },
  { dialect: 'mysql', pattern: /\bAUTO_INCREMENT\b/i, weight: 3 },
  { dialect: 'mysql', pattern: /\bENGINE\s*=/i, weight: 3 },
  { dialect: 'mysql', pattern: /\bCHARSET\s*=|\bCHARACTER\s+SET\s+\w/i, weight: 2 },
  { dialect: 'mysql', pattern: /\bUNSIGNED\b/i, weight: 2 },
  {
    dialect: 'mysql',
    pattern: /\b(?:TINYINT|MEDIUMINT|TINYTEXT|MEDIUMTEXT|LONGTEXT|MEDIUMBLOB|LONGBLOB)\b/i,
    weight: 2,
  },
  { dialect: 'mysql', pattern: /\bCOMMENT\s*=?\s*'/i, weight: 2 },
  { dialect: 'mysql', pattern: /(?<!\bAS\s+)\bENUM\s*\(/i, weight: 2 },
  { dialect: 'mysql', pattern: /\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i, weight: 3 },

  { dialect: 'postgresql', pattern: /\b(?:SMALL|BIG)?SERIAL\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /::\s*[A-Za-z]/, weight: 3 },
  { dialect: 'postgresql', pattern: /\bTIMESTAMPTZ\b|\bWITHOUT\s+TIME\s+ZONE\b/i, weight: 3 },
  // Oracle también tiene `WITH TIME ZONE`: peso bajo para no desempatar solo con esto.
  { dialect: 'postgresql', pattern: /\bWITH\s+TIME\s+ZONE\b/i, weight: 1 },
  { dialect: 'postgresql', pattern: /\b(?:BYTEA|JSONB|CITEXT|INET|CIDR)\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bCHARACTER\s+VARYING\b|\bDOUBLE\s+PRECISION\b/i, weight: 2 },
  { dialect: 'postgresql', pattern: /\bnextval\s*\(/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bALTER\s+TABLE\s+ONLY\b|\bOWNER\s+TO\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bCREATE\s+(?:EXTENSION|TYPE\s+\S+\s+AS\s+ENUM)\b/i, weight: 3 },
  // Oracle usa la misma sintaxis `COMMENT ON`.
  { dialect: 'postgresql', pattern: /\bCOMMENT\s+ON\s+(?:TABLE|COLUMN)\b/i, weight: 1 },
  {
    dialect: 'postgresql',
    pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
    weight: 2,
  },
  { dialect: 'postgresql', pattern: /\w\[\]/, weight: 2 },
  { dialect: 'postgresql', pattern: /\bUUID\b/i, weight: 1 },

  { dialect: 'sqlite', pattern: /\bAUTOINCREMENT\b/i, weight: 3 },
  { dialect: 'sqlite', pattern: /\bWITHOUT\s+ROWID\b/i, weight: 3 },
  { dialect: 'sqlite', pattern: /\bPRAGMA\b/i, weight: 3 },
  { dialect: 'sqlite', pattern: /\)\s*STRICT\b/i, weight: 2 },

  { dialect: 'oracle', pattern: /\bN?VARCHAR2\b/i, weight: 3 },
  { dialect: 'oracle', pattern: /\bNUMBER\s*\(/i, weight: 3 },
  { dialect: 'oracle', pattern: /\b(?:BINARY_FLOAT|BINARY_DOUBLE|XMLTYPE|NCLOB|UROWID)\b|\bLONG\s+RAW\b/i, weight: 3 },
  { dialect: 'oracle', pattern: /\bSYS(?:DATE|TIMESTAMP|_GUID)\b/i, weight: 3 },
  { dialect: 'oracle', pattern: /\.\s*"?NEXTVAL\b/i, weight: 3 },
  { dialect: 'oracle', pattern: /:NEW\s*\./i, weight: 3 },
  { dialect: 'oracle', pattern: /\bNOT\s+NULL\s+ENABLE\b|\bON\s+NULL\s+AS\s+IDENTITY\b/i, weight: 3 },
  { dialect: 'oracle', pattern: /\bWITH\s+LOCAL\s+TIME\s+ZONE\b/i, weight: 3 },
  { dialect: 'oracle', pattern: /\bSEGMENT\s+CREATION\b|\bPCTFREE\b|\bFROM\s+DUAL\b/i, weight: 3 },
  // Terminador de SQL*Plus: una barra sola en su línea.
  { dialect: 'oracle', pattern: /^[ \t]*\/[ \t]*$/m, weight: 2 },
];

/**
 * Detecta el dialecto a partir de rasgos de sintaxis. Devuelve `null` si no
 * hay ningún rasgo o si hay empate entre dialectos.
 */
export function detectDialect(sql: string): SqlDialect | null {
  const scores = new Map<SqlDialect, number>();
  for (const marker of MARKERS) {
    if (marker.pattern.test(sql)) {
      scores.set(marker.dialect, (scores.get(marker.dialect) ?? 0) + marker.weight);
    }
  }

  let best: SqlDialect | null = null;
  let bestScore = 0;
  let tie = false;
  for (const [dialect, score] of scores) {
    if (score > bestScore) {
      best = dialect;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
}
