export type Pledge = {
  from: string;
  to: string;
  amount: number;
  round_made: number;
  due_round: number;
};

export type DefectionRecord = {
  round_due: number;
  from: string;
  to: string;
  pledged: number;
  actual: number;
};

export type PledgeSettlement = {
  from: string;
  to: string;
  pledged: number;
  actual: number;
  status: "kept" | "defected";
  bonus_paid: number;
};

/**
 * Look up the per-defector bonus for `n` distinct defectors this round.
 * For n > table.length the last entry repeats (so a 4+ defector case with
 * default [3,1,0,-2] yields -2 for any N ≥ 4).
 */
export function lookupBetrayalBonus(n: number, table: readonly number[]): number {
  if (n <= 0 || table.length === 0) return 0;
  const idx = Math.min(n - 1, table.length - 1);
  return table[idx] ?? 0;
}
