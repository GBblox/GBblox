import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Loader2, Receipt, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PostageCard } from "@/components/postage-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAddress, formatMoney, formatWhen, saleStatusLabel } from "@/lib/format";
import { getSaleOrder, listSales } from "@/lib/server/orders";
import { bricklinkCanSync, credentialsOf, ebayCanPublish, useSettings } from "@/lib/settings";
import type { SaleChannel, SaleOrder, SaleOrderDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNELS: { id: "all" | SaleChannel; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ebay", label: "eBay" },
  { id: "bricklink", label: "BrickLink" },
];

export function SalesPanel({ catalogSkus }: { catalogSkus: Set<string> }) {
  const qc = useQueryClient();
  const settings = useSettings();
  const [channel, setChannel] = useState<"all" | SaleChannel>("all");
  const [detail, setDetail] = useState<SaleOrderDetail | null>(null);
  const canEbay = ebayCanPublish(settings);
  const canBl = bricklinkCanSync(settings);

  const query = useQuery({
    queryKey: ["sales", settings.ebayUserToken, settings.blToken, settings.marketplace],
    queryFn: () => listSales({ data: credentialsOf(settings) }),
    enabled: canEbay || canBl,
  });

  const loadDetail = useMutation({
    mutationFn: ({ order, refresh }: { order: SaleOrder; refresh: boolean }) =>
      getSaleOrder({
        data: {
          ...credentialsOf(settings),
          channel: order.channel,
          id: order.id,
          refresh,
        },
      }),
    onSuccess: (row, vars) => {
      setDetail(row);
      qc.invalidateQueries({ queryKey: ["sales"] });
      if (vars.refresh) toast.success(`Pulled ${row.channel === "ebay" ? "eBay" : "BrickLink"} order #${row.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not pull order"),
  });

  const orders = useMemo(() => {
    const rows = query.data?.orders ?? [];
    if (channel === "all") return rows;
    return rows.filter((o) => o.channel === channel);
  }, [query.data, channel]);

  const totals = useMemo(() => {
    const currency = orders[0]?.currency ?? "GBP";
    const sum = orders.reduce((n, o) => n + (o.total ?? 0), 0);
    return { count: orders.length, sum, currency };
  }, [orders]);

  if (!canEbay && !canBl) {
    return (
      <div className="rounded-md bg-surface p-8 text-center shadow-[var(--shadow-border)]">
        <Receipt className="mx-auto size-8 text-subtle" />
        <p className="mt-3 font-display text-xl font-extrabold">No sales connected</p>
        <p className="mt-1 text-sm text-muted">
          Add an eBay user token or BrickLink store keys in Settings to pull live orders.
        </p>
      </div>
    );
  }

  if (detail) {
    return (
      <OrderPage
        detail={detail}
        catalogSkus={catalogSkus}
        onBack={() => setDetail(null)}
        onRefresh={() => {
          loadDetail.mutate({ order: detail, refresh: true });
        }}
        onPostage={setDetail}
        refreshing={loadDetail.isPending}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <nav className="-mx-1 flex overflow-x-auto px-1" aria-label="Sales channels">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannel(c.id)}
              className={cn(
                "h-10 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors",
                channel === c.id ? "border-link text-link" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">
            {totals.count} order{totals.count === 1 ? "" : "s"} · {formatMoney(totals.sum || null, totals.currency)}
          </p>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}>
            {query.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </div>

      {query.data?.warnings.map((w) => (
        <p key={w} className="rounded-md bg-warn/15 px-3 py-2 text-xs text-warn">
          {w}
        </p>
      ))}

      {query.isLoading && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          Loading eBay and BrickLink orders
        </p>
      )}

      {query.isError && (
        <p className="rounded-md bg-danger/10 p-4 text-sm text-danger">
          {query.error instanceof Error ? query.error.message : "Could not load sales"}
        </p>
      )}

      {query.isSuccess && orders.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">
          {channel === "ebay" && !canEbay
            ? "Add an eBay user token in Settings to pull eBay sold orders."
            : channel === "bricklink" && !canBl
              ? "Add BrickLink store keys in Settings to pull BrickLink orders."
              : "No open or recent orders on this channel."}
        </p>
      )}

      {orders.length > 0 && (
        <ul className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
          {orders.map((order) => {
            const loading =
              loadDetail.isPending &&
              loadDetail.variables?.order.id === order.id &&
              loadDetail.variables.order.channel === order.channel;
            const inCatalog = order.items.some((it) => it.sku && catalogSkus.has(it.sku.toUpperCase()));
            return (
              <li key={`${order.channel}-${order.id}`} className="border-b border-border last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={order.channel === "ebay" ? "ebay" : "bricklink"}>
                        {order.channel === "ebay" ? "eBay" : "BrickLink"}
                      </Badge>
                      <Badge variant={/cancel/i.test(order.status) ? "off" : "sale"}>
                        {saleStatusLabel(order.status)}
                      </Badge>
                      {order.pulled ? <Badge variant="listed">In app</Badge> : null}
                      {inCatalog ? <Badge variant="listed">In catalog</Badge> : null}
                      <span className="font-mono text-xs text-subtle">#{order.id}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{order.buyer}</p>
                    <p className="text-xs text-muted">
                      {formatWhen(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="font-display text-lg font-extrabold tabular-nums">
                      {formatMoney(order.total, order.currency)}
                    </p>
                    <Button
                      variant={order.pulled ? "outline" : "secondary"}
                      size="sm"
                      disabled={loadDetail.isPending}
                      onClick={() => loadDetail.mutate({ order, refresh: !order.pulled })}
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <FileDown />}
                      {order.pulled ? "View" : "Pull details"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OrderPage({
  detail,
  catalogSkus,
  onBack,
  onRefresh,
  onPostage,
  refreshing,
}: {
  detail: SaleOrderDetail;
  catalogSkus: Set<string>;
  onBack: () => void;
  onRefresh: () => void;
  onPostage: (row: SaleOrderDetail) => void;
  refreshing: boolean;
}) {
  const addr = formatAddress(detail.address);
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          Sales
        </Button>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={detail.channel === "ebay" ? "ebay" : "bricklink"}>
                {detail.channel === "ebay" ? "eBay" : "BrickLink"}
              </Badge>
              <Badge variant="sale">{saleStatusLabel(detail.status)}</Badge>
              <Badge variant="listed">In app</Badge>
            </div>
            <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
              Order #{detail.id}
            </h3>
            <p className="text-sm text-muted">{detail.buyer}</p>
          </div>
          <p className="font-display text-3xl font-extrabold tabular-nums">
            {formatMoney(detail.total, detail.currency)}
          </p>
        </div>

        <section className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Ordered" value={formatWhen(detail.createdAt)} />
          <Field label="Paid" value={formatWhen(detail.paidAt)} />
          <Field label="Shipped" value={formatWhen(detail.shippedAt)} />
          <Field label="Payment" value={detail.payment || "—"} />
          <Field label="Ship method" value={detail.shippingMethod || "—"} />
          {detail.email ? <Field label="Email" value={detail.email} /> : null}
          {detail.phone ? <Field label="Phone" value={detail.phone} /> : null}
        </section>

        {addr ? (
          <section>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Ship to</p>
            <p className="mt-1 whitespace-pre-line text-sm">{addr}</p>
          </section>
        ) : null}

        <PostageCard detail={detail} onUpdated={onPostage} />

        <section>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Items</p>
          {detail.items.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No line items on this order.</p>
          ) : (
            <ul className="mt-2 overflow-hidden rounded-md bg-surface-2">
              {detail.items.map((line, i) => {
                const inCatalog = Boolean(line.sku && catalogSkus.has(line.sku.toUpperCase()));
                const meta = [line.itemKind, line.itemNo, line.condition, line.color, line.sku].filter(Boolean);
                return (
                  <li
                    key={`${line.sku ?? line.itemNo ?? line.title}-${i}`}
                    className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      {line.imageUrl ? (
                        <img
                          src={line.imageUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-sm bg-white object-contain"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {line.qty}× {line.title}
                        </p>
                        <p className="text-[11px] text-subtle">
                          {meta.join(" · ") || "—"}
                          {inCatalog ? " · in catalog" : ""}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(line.price, detail.currency)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(detail.subtotal, detail.currency)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Shipping</span>
            <span className="tabular-nums">{formatMoney(detail.shippingCost, detail.currency)}</span>
          </div>
          <div className="flex justify-between font-display text-lg font-extrabold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(detail.total, detail.currency)}</span>
          </div>
        </section>

        {detail.remarks ? (
          <section>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Remarks</p>
            <p className="mt-1 whitespace-pre-line text-sm">{detail.remarks}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium break-words">{value}</p>
    </div>
  );
}
