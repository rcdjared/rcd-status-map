import type { Mark } from './painting';

export type UndoAction =
  | { kind: 'add'; mark: Mark }
  | { kind: 'erase'; marks: Mark[] }
  | { kind: 'status'; markId: string; previousStatus: string; newStatus: string }
  | { kind: 'legend'; previous: [number, number]; next: [number, number] }
  | { kind: 'batch'; actions: UndoAction[] };

export function canUndoStatusChange(
  previousStatus: string,
  currentStatus: string,
  changedBy: string | null,
  currentUserId: string
): boolean {
  return previousStatus !== currentStatus && changedBy === currentUserId;
}
