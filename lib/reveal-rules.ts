/** Reveal rules that the browser also needs. No database code here. */

export type RevealedPair = { giverName: string; receiverName: string };

/** True while the visitor's own calendar day is before the exchange date (yyyy-mm-dd). */
export function isBeforeExchangeDate(exchangeDate: string | null, now: Date): boolean {
  if (!exchangeDate) return false;
  const pad = (part: number) => String(part).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return today < exchangeDate;
}

/** Orders the pairs of a full reveal as the ring: each receiver is the giver of the next pair. */
export function ringOrder(pairs: readonly RevealedPair[]): RevealedPair[] {
  const byGiver = new Map(pairs.map((pair) => [pair.giverName, pair]));
  const ring: RevealedPair[] = [];
  let next = pairs[0];
  while (next && ring.length < pairs.length) {
    ring.push(next);
    next = byGiver.get(next.receiverName)!;
  }
  return ring;
}
