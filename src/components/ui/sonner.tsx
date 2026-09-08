import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "bg-surface text-fg border-border shadow-[var(--shadow-border)]",
          description: "text-muted",
        },
      }}
    />
  );
}
