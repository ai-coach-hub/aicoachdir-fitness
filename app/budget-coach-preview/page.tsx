import type { Metadata } from "next";
import BudgetPrototype from "./BudgetPrototype";

export const metadata: Metadata = {
  title: "AI Budget Coach Preview | AI Coach Directory",
  description:
    "Private development preview for the AI Coach Directory budgeting experience.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function BudgetCoachPreviewPage() {
  return <BudgetPrototype />;
}
