import type { LotRegisterRow } from '../api/supabase';
import type { Mark } from './painting';

export interface ClearRecoverySnapshot {
  scope: string;
  clearedAt: string;
  marks: Mark[];
  lots: LotRegisterRow[];
}

export type ClearRecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_PREFIX = 'rrh-clear-recovery-v1-';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMark(value: unknown): value is Mark {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.t === 'f' || value.t === 'p') &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    typeof value.s === 'string' &&
    (value.sp === undefined ||
      (Array.isArray(value.sp) &&
        value.sp.every((span) =>
          Array.isArray(span) &&
          span.length === 3 &&
          span.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
        )))
  );
}

function isLot(value: unknown): value is LotRegisterRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.project_id === 'string' &&
    (typeof value.mark_id === 'string' || value.mark_id === null) &&
    typeof value.phase === 'string' &&
    typeof value.block === 'string' &&
    typeof value.lot === 'string' &&
    typeof value.status === 'string'
  );
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function isClearRecoverySnapshot(
  value: unknown,
  scope: string
): value is ClearRecoverySnapshot {
  return (
    isRecord(value) &&
    value.scope === scope &&
    typeof value.clearedAt === 'string' &&
    Array.isArray(value.marks) &&
    value.marks.every(isMark) &&
    Array.isArray(value.lots) &&
    value.lots.every(isLot)
  );
}

export function saveClearRecoverySnapshot(
  storage: ClearRecoveryStorage,
  snapshot: ClearRecoverySnapshot
): void {
  storage.setItem(storageKey(snapshot.scope), JSON.stringify(snapshot));
}

export function loadClearRecoverySnapshot(
  storage: ClearRecoveryStorage,
  scope: string
): ClearRecoverySnapshot | null {
  const raw = storage.getItem(storageKey(scope));
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Saved clear recovery data is not valid JSON.');
  }

  if (!isClearRecoverySnapshot(value, scope)) {
    throw new Error('Saved clear recovery data is incomplete or belongs to another project.');
  }

  return value;
}

export function removeClearRecoverySnapshot(
  storage: ClearRecoveryStorage,
  scope: string
): void {
  storage.removeItem(storageKey(scope));
}
