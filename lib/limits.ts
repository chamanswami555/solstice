/**
 * Every cap and limit of the product, in one place. The same numbers are checks in the database
 * (db/migrations), so a change here needs a migration too.
 */
export const LIMITS = {
  roomNameMax: 60,
  displayNameMax: 30,
  budgetMax: 40,
  /** A December room cannot be planned further ahead than this. */
  exchangeDateMaxDaysAhead: 731,
} as const;
