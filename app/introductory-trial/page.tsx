import {notFound,redirect} from "next/navigation";
import {currentUser} from "@clerk/nextjs/server";
import SiteHeader from "@/components/SiteHeader";
import TermsDocument from "@/components/TermsDocument";
import TrialTermsGate from "@/components/TrialTermsGate";
import {publicTrialReleaseGate} from "@/lib/publicIntroductoryTrialAdmission";
export const dynamic="force-dynamic";
export default async function PublicTrialTermsPage(){
 if(!publicTrialReleaseGate(process.env))notFound();
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")redirect("/introductory-trial/create-account");
 return <main className="signup-shell">
  <SiteHeader compact/>
  <TrialTermsGate><TermsDocument/></TrialTermsGate>
 </main>;
}
