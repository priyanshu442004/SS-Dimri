import { EmptyState, LinkButton } from "@/components/ui";

export default function NoAccessPage() {
  return (
    <EmptyState kind="search" title="You don't have access to this page" action={<LinkButton href="/app">Back to dashboard</LinkButton>}>
      Your role does not include this area. If you need access, ask your administrator.
    </EmptyState>
  );
}
