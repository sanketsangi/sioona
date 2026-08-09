import { redirect } from "next/navigation";

export default function EvalRedirect() {
  redirect("/?view=eval");
}
