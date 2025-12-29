import { redirect } from "next/navigation"

export default async function IdentifyCitationsPageRoute({
  params,
}: {
  params: Promise<{ fileId: string }>
}) {
  const { fileId } = await params
  redirect(`/citation-checker/${fileId}/run-citation-checker`)
}

