import {notFound} from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import TermsDocument from "@/components/TermsDocument";
import TrialTermsGate from "@/components/TrialTermsGate";
import {publicTrialReleaseGate} from "@/lib/publicIntroductoryTrialAdmission";
export const dynamic="force-dynamic";
export default function PublicTrialTermsPage(){
 if(!publicTrialReleaseGate(process.env))notFound();
 return <main className="signup-shell">
  <SiteHeader compact/>
  <TrialTermsGate><TermsDocument/></TrialTermsGate>
 </main>;
}
