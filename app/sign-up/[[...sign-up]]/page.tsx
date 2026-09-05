import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignUpPage() {
  return <SignUp />;
}
