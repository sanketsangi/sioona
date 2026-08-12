import { redirect } from "next/navigation";

export default async function SignalRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?view=insights&preview=${encodeURIComponent(id)}`);
}
