import { createFileRoute } from "@tanstack/react-router";
import { OwnerGate } from "@/components/owner-gate";
import { ShelfApp } from "@/components/shelf-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <OwnerGate>
      <ShelfApp />
    </OwnerGate>
  );
}
