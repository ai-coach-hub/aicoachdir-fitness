import {notFound} from "next/navigation";
import {publicTrialReleaseGate} from "@/lib/publicIntroductoryTrialAdmission";
export const dynamic="force-dynamic";
export default function PublicTrialSignupLayout({children}:{children:React.ReactNode}){
 if(!publicTrialReleaseGate(process.env))notFound();
 return children;
}
