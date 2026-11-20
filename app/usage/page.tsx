import type { Metadata } from "next";
import { Usage } from "@/components/usage";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Usage, ${BRAND.name}` };

export default function UsagePage() {
  return (
    <div className="room">
      <div className="room__head">
        <h1 className="room__title">Usage</h1>
        <p className="room__meta">Counts from the database at the moment you open this page.</p>
      </div>
      <Usage />
    </div>
  );
}
