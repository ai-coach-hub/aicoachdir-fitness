import LegacyMemberAccountClient from "@/components/LegacyMemberAccountClient";

type LegacyMemberPageProps = {
  searchParams: Promise<{ destination?: string | string[] }>;
};

export default async function LegacyMemberAccountPage({ searchParams }: LegacyMemberPageProps) {
  const params = await searchParams;
  const requested = Array.isArray(params.destination) ? params.destination[0] : params.destination;
  const returnPath = requested === "manage-subscription" ? "/manage-subscription" : "/fitness/chat";
  return <LegacyMemberAccountClient returnPath={returnPath} />;
}
