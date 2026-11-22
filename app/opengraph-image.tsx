import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// The picture a chat or a post shows for a shared link: the reveal stage of the room, with the product line.
// An image has no CSS tokens, so the colours are close sRGB copies of the board, board-type and paper tokens of app/tokens.css.
export const alt = `${BRAND.name}: a Secret Santa for your group. The reveal shows "The secret giver of Rohan is Meera".`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", background: "#f5ecd9", color: "#14281f" }}>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{BRAND.name}</div>
        <div style={{ fontSize: 40, marginTop: 12 }}>A Secret Santa for your group, on one link.</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 48, padding: "44px 0", borderRadius: 28, background: "#1d3a2e", color: "#f8f3e6" }}>
          <div style={{ fontSize: 36 }}>The secret giver of Rohan is</div>
          <div style={{ fontSize: 96, fontWeight: 700, marginTop: 8 }}>Meera</div>
        </div>
      </div>
    ),
    size,
  );
}
