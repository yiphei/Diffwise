import { cookies } from "next/headers";
import { LandingClient } from "@/components/landing/LandingClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const c = await cookies();
  const signedIn = c.has("dw_session");
  return <LandingClient signedIn={signedIn} />;
}
