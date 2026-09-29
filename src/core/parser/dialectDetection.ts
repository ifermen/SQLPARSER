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
  { dialect: 'postgresql', pattern: /\bTIMESTAMPTZ\b|\bWITH(?:OUT)?\s+TIME\s+ZONE\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\b(?:BYTEA|JSONB|CITEXT|INET|CIDR)\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bCHARACTER\s+VARYING\b|\bDOUBLE\s+PRECISION\b/i, weight: 2 },
  { dialect: 'postgresql', pattern: /\bnextval\s*\(/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bALTER\s+TABLE\s+ONLY\b|\bOWNER\s+TO\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bCREATE\s+(?:EXTENSION|TYPE\s+\S+\s+AS\s+ENUM)\b/i, weight: 3 },
  { dialect: 'postgresql', pattern: /\bCOMMENT\s+ON\s+(?:TABLE|COLUMN)\b/i, weight: 2 },
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
