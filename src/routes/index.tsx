import { createFileRoute } from "@tanstack/react-router";
import { ShelfApp } from "@/components/shelf-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ShelfApp />;
}
