/**
 * Every cap and limit of the product, in one place. The same numbers are checks in the database
 * (db/migrations), so a change here needs a migration too.
 */
export const LIMITS = {
  roomNameMax: 60,
  displayNameMax: 30,
  budgetMax: 40,
  /** Members and guests together in one room. */
  roomPeopleMax: 40,
  talkTextMax: 500,
  /** Total identities, below the 2,000 monthly active users of the free Nexconn plan. */
  identityCap: 1800,
  /** A December room cannot be planned further ahead than this. */
  exchangeDateMaxDaysAhead: 731,
} as const;
