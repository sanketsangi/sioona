import { redirect } from "next/navigation";

export default function TaxonomyRedirect() {
  redirect("/?view=taxonomy");
}
