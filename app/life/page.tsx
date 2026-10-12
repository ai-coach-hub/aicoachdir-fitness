import Link from "next/link";
import { redirect } from "next/navigation";
import { lifeTester } from "@/lib/lifeCoachAccess";
import LifeChat from "./LifeChat";
export const dynamic="force-dynamic";
export default async function LifePage(){
 const id=await lifeTester();
 if(!id) redirect("/fitness/login");
 return <main className="site-shell" style={{padding:"32px 0"}}>
   <Link href="/" style={{color:"#80d84e"}}>← AI Coach Directory</Link>
   <LifeChat/>
 </main>;
}
