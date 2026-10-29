import RequestDetail from "@/components/request-detail";

export const metadata = { title: "Request details · ReturnDesk" };
export default async function RequestPage({ params }) {
  const { id } = await params;
  return <RequestDetail key={id} id={id} />;
}
