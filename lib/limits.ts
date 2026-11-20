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
  wishesMax: 5,
  wishTextMax: 120,
  noteTextMax: 500,
  maskTextMax: 1000,
  /** Mask messages of one member in one minute, over both threads. */
  maskPerMinute: 20,
  /** The newest messages of a thread that a browser gets. */
  maskHistory: 200,
  /** Total identities, below the 2,000 monthly active users of the free Nexconn plan. */
  identityCap: 1800,
  /** A December room cannot be planned further ahead than this. */
  exchangeDateMaxDaysAhead: 731,
} as const;
