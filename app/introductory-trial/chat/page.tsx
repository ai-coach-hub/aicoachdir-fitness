import {notFound} from "next/navigation";
import TrialChatClient from "@/components/TrialChatClient";
import {publicTrialReleaseGate} from "@/lib/publicIntroductoryTrialAdmission";
export const dynamic="force-dynamic";
export default function PublicTrialChatPage(){
 if(!publicTrialReleaseGate(process.env))notFound();
 return <TrialChatClient/>;
}
