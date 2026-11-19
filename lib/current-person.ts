import { cookies } from "next/headers";
import { readConfig } from "@/lib/config";
import { IDENTITY_COOKIE, IDENTITY_COOKIE_OPTIONS, readIdentity, signIdentity } from "@/lib/identity";

/** The person id of the signed cookie, or null for a visitor with no valid cookie. */
export async function currentPersonId(): Promise<string | null> {
  const cookie = (await cookies()).get(IDENTITY_COOKIE)?.value;
  return readIdentity(cookie, readConfig().sessionSecret);
}

export async function rememberPerson(personId: string): Promise<void> {
  (await cookies()).set(IDENTITY_COOKIE, signIdentity(personId, readConfig().sessionSecret), IDENTITY_COOKIE_OPTIONS);
}
