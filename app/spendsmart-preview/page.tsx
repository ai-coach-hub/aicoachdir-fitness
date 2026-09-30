import type { Metadata } from "next";
import BudgetPrototype from "./BudgetPrototype";

export const metadata: Metadata = {
  title: "SpendSmart Budget Coach Preview | AI Coach Directory",
  description:
    "Private development preview for the AI Coach Directory SpendSmart budgeting experience.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SpendSmartPreviewPage() {
  return <BudgetPrototype />;
}
