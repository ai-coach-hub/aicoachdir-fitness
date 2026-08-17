import { termsHtml } from "@/lib/termsContent";

export default function TermsDocument() {
  return <div className="legal-copy" dangerouslySetInnerHTML={{ __html: termsHtml }} />;
}
