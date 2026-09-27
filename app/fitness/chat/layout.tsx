import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FitnessChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();

  if (!user) {
    redirect("/fitness/login");
  }

  return children;
}
