import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BatchNumberSelect } from "@/components/batch-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { firstBatchError, paymentsForPlatform, validateBatch } from "@/lib/batch-rules";
import { formatMoney } from "@/lib/format";
import { createBatch, deleteBatch, listBatches, nextBatchNumber, updateBatch } from "@/lib/server/batches";
import { updateSet } from "@/lib/server/sets";
import { BATCH_PAYMENTS, BATCH_PLATFORMS, type LegoSet, type PurchaseBatch } from "@/lib/types";

function fieldError(text?: string) {
  if (!text) return null;
  return <p className="text-xs text-danger">{text}</p>;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function platformLabel(value: string) {
  return BATCH_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

function paymentLabel(value: string) {
  return BATCH_PAYMENTS.find((p) => p.value === value)?.label ?? value;
}

export function BatchesPanel({
  lots,
  onOpenLot,
}: {
  lots: LegoSet[];
  onOpenLot: (lot: LegoSet) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => listBatches(),
  });
  const batches = batchesQuery.data ?? [];
  const selectedBatch = batches.find((b) => b.batchNumber === selected) ?? null;
  const members = useMemo(
    () => (selected ? lots.filter((lot) => lot.batchNumber === selected) : []),
    [lots, selected],
  );

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">Batches</h1>
          <p className="mt-2 text-[16px] leading-snug text-fg">
            Bulk buys that items are split from. Attach a batch number on each lot.
          </p>
        </div>
        {!creating ? (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus />
            New batch
          </Button>
        ) : null}
      </div>

      {creating ? (
        <CreateBatchForm
          onCancel={() => setCreating(false)}
          onCreated={(batch) => {
            setCreating(false);
            setSelected(batch.batchNumber);
            void qc.invalidateQueries({ queryKey: ["batches"] });
          }}
        />
      ) : selectedBatch ? (
        <BatchDetail
          batch={selectedBatch}
          lots={members}
          recent={lots}
          onBack={() => setSelected(null)}
          onOpenLot={onOpenLot}
          onDeleted={() => setSelected(null)}
        />
      ) : (
        <>
          {batchesQuery.isLoading ? (
            <p className="mt-8 text-sm text-muted">Loading batches…</p>
          ) : batches.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">No batches yet. Create one when you buy a bulk lot.</p>
          ) : (
            <ul className="mt-5 overflow-hidden rounded-md bg-white shadow-[var(--shadow-border)]">
              {batches.map((batch) => {
                const count = lots.filter((lot) => lot.batchNumber === batch.batchNumber).length;
                return (
                  <li key={batch.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setSelected(batch.batchNumber)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-navy">
                        <Layers className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-semibold">{batch.batchNumber}</span>
                        <span className="block text-sm text-muted">
                          {batch.purchasedOn} · {platformLabel(batch.platform)} · {batch.sellerName}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold">
                          {batch.price != null ? formatMoney(batch.price, batch.currency) : "—"}
                        </span>
                        <span className="text-xs text-muted">{count} items</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <RecentItems lots={lots} onOpenLot={onOpenLot} />
        </>
      )}
    </section>
  );
}

function BatchDetail({
  batch,
  lots,
  recent,
  onBack,
  onOpenLot,
  onDeleted,
}: {
  batch: PurchaseBatch;
  lots: LegoSet[];
  recent: LegoSet[];
  onBack: () => void;
  onOpenLot: (lot: LegoSet) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const unlink = useMutation({
    mutationFn: (id: number) => updateSet({ data: { id, batchNumber: "" } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success("Removed from batch");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update item"),
  });
  const remove = useMutation({
    mutationFn: () => deleteBatch({ data: { id: batch.id, batchNumber: batch.batchNumber } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["batches"] });
      void qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success(`${batch.batchNumber} deleted`);
      onDeleted();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete batch"),
  });

  if (editing) {
    return (
      <div className="mt-5">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel edit
        </Button>
        <EditBatchForm
          batch={batch}
          onSaved={() => {
            setEditing(false);
            void qc.invalidateQueries({ queryKey: ["batches"] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          All batches
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>
      <div className="rounded-md bg-white p-5 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-extrabold tracking-tight text-navy">{batch.batchNumber}</p>
            <p className="mt-1 text-sm text-muted">{batch.purchasedOn}</p>
          </div>
          <p className="font-display text-2xl font-extrabold tabular-nums text-navy">
            {batch.price != null ? formatMoney(batch.price, batch.currency) : "—"}
          </p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Platform</p>
            <p className="mt-1 text-sm font-semibold">{platformLabel(batch.platform)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Payment</p>
            <p className="mt-1 text-sm font-semibold">{paymentLabel(batch.paymentMethod)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Order number</p>
            <p className="mt-1 font-mono text-sm">{batch.orderNumber.trim() || "—"}</p>
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Seller</p>
          <p className="mt-2 text-sm font-semibold">{batch.sellerName}</p>
          <p className="mt-1 text-sm leading-relaxed text-fg">
            {batch.sellerLine1}
            {batch.sellerLine2 ? (
              <>
                <br />
                {batch.sellerLine2}
              </>
            ) : null}
            <br />
            {batch.sellerCity}
            {batch.sellerRegion ? `, ${batch.sellerRegion}` : ""} {batch.sellerPostal}
            <br />
            {batch.sellerCountry}
          </p>
        </div>
      </div>
      <div className="rounded-md bg-white p-5 shadow-[var(--shadow-border)]">
        <p className="text-sm font-semibold">{lots.length} items from this batch</p>
        {lots.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No catalog lots use this batch number yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {lots.map((lot) => (
              <li key={lot.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenLot(lot)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  {lot.imageUrl ? (
                    <img src={lot.imageUrl} alt="" className="size-12 rounded-sm bg-white object-contain" />
                  ) : (
                    <span className="size-12 rounded-sm bg-surface-2" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{lot.name}</span>
                    <span className="font-mono text-xs text-muted">{lot.sku}</span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mr-2"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate(lot.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <RecentItems
        lots={recent.filter((lot) => lot.batchNumber !== batch.batchNumber)}
        onOpenLot={onOpenLot}
        attachTo={batch.batchNumber}
      />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {batch.batchNumber}?</DialogTitle>
            <DialogDescription>
              The batch record is removed. Items keep their catalog entries but lose this batch number.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete batch
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function recentLots(lots: LegoSet[], limit = 16) {
  return [...lots]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
    .slice(0, limit);
}

function RecentItems({
  lots,
  onOpenLot,
  attachTo,
}: {
  lots: LegoSet[];
  onOpenLot: (lot: LegoSet) => void;
  attachTo?: string;
}) {
  const qc = useQueryClient();
  const rows = recentLots(lots);
  const link = useMutation({
    mutationFn: ({ id, batchNumber }: { id: number; batchNumber: string }) =>
      updateSet({ data: { id, batchNumber } }),
    onSuccess: (_row, vars) => {
      void qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success(vars.batchNumber ? `Linked to ${vars.batchNumber}` : "Batch cleared");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update batch"),
  });

  if (rows.length === 0) return null;

  return (
    <div className="mt-5 rounded-md bg-white p-5 shadow-[var(--shadow-border)]">
      <p className="text-sm font-semibold">Recently added items</p>
      <p className="mt-1 text-xs text-muted">
        {attachTo ? `Add a lot to ${attachTo}, or pick another batch.` : "Assign a batch number to a recent lot."}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((lot) => (
          <li key={lot.id} className="flex items-center gap-3 px-3 py-2.5">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpenLot(lot)}>
              {lot.imageUrl ? (
                <img src={lot.imageUrl} alt="" className="size-12 shrink-0 rounded-sm bg-white object-contain" />
              ) : (
                <span className="size-12 shrink-0 rounded-sm bg-surface-2" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{lot.name}</span>
                <span className="font-mono text-xs text-muted">{lot.sku}</span>
              </span>
            </button>
            {attachTo && lot.batchNumber !== attachTo ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={link.isPending}
                onClick={() => link.mutate({ id: lot.id, batchNumber: attachTo })}
              >
                Add to {attachTo}
              </Button>
            ) : (
              <div className="w-40 shrink-0">
                <BatchNumberSelect
                  value={lot.batchNumber}
                  onChange={(next) => link.mutate({ id: lot.id, batchNumber: next })}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditBatchForm({ batch, onSaved }: { batch: PurchaseBatch; onSaved: () => void }) {
  const [purchasedOn, setPurchasedOn] = useState(batch.purchasedOn);
  const [platform, setPlatform] = useState(batch.platform);
  const [payment, setPayment] = useState(batch.paymentMethod);
  const [orderNumber, setOrderNumber] = useState(batch.orderNumber);
  const [sellerName, setSellerName] = useState(batch.sellerName);
  const [line1, setLine1] = useState(batch.sellerLine1);
  const [line2, setLine2] = useState(batch.sellerLine2);
  const [city, setCity] = useState(batch.sellerCity);
  const [region, setRegion] = useState(batch.sellerRegion);
  const [postal, setPostal] = useState(batch.sellerPostal);
  const [country, setCountry] = useState(batch.sellerCountry);
  const [price, setPrice] = useState(batch.price == null ? "" : String(batch.price));
  const [errors, setErrors] = useState<ReturnType<typeof validateBatch>>({});

  const payload = () => ({
    purchasedOn,
    platform,
    paymentMethod: payment,
    orderNumber,
    sellerName,
    sellerLine1: line1,
    sellerCity: city,
    sellerPostal: postal,
    sellerCountry: country,
    price,
  });

  const save = useMutation({
    mutationFn: () => {
      const issues = validateBatch(payload());
      setErrors(issues);
      const problem = firstBatchError(issues);
      if (problem) throw new Error(problem);
      const amount = Number(price);
      return updateBatch({
        data: {
          id: batch.id,
          purchasedOn,
          platform,
          paymentMethod: payment,
          orderNumber,
          sellerName,
          sellerLine1: line1,
          sellerLine2: line2,
          sellerCity: city,
          sellerRegion: region,
          sellerPostal: postal,
          sellerCountry: country,
          price: amount,
        },
      });
    },
    onSuccess: () => {
      toast.success(`${batch.batchNumber} updated`);
      onSaved();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save batch"),
  });

  return (
    <form
      className="mt-3 space-y-4 rounded-md bg-white p-4 shadow-[var(--shadow-border)]"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="font-mono text-sm font-semibold">{batch.batchNumber}</p>
      <BatchFields
        purchasedOn={purchasedOn}
        setPurchasedOn={setPurchasedOn}
        platform={platform}
        setPlatform={setPlatform}
        payment={payment}
        setPayment={setPayment}
        orderNumber={orderNumber}
        setOrderNumber={setOrderNumber}
        sellerName={sellerName}
        setSellerName={setSellerName}
        line1={line1}
        setLine1={setLine1}
        line2={line2}
        setLine2={setLine2}
        city={city}
        setCity={setCity}
        region={region}
        setRegion={setRegion}
        postal={postal}
        setPostal={setPostal}
        country={country}
        setCountry={setCountry}
        price={price}
        setPrice={setPrice}
        errors={errors}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          Save batch
        </Button>
      </div>
    </form>
  );
}

function BatchFields({
  purchasedOn,
  setPurchasedOn,
  platform,
  setPlatform,
  payment,
  setPayment,
  orderNumber,
  setOrderNumber,
  sellerName,
  setSellerName,
  line1,
  setLine1,
  line2,
  setLine2,
  city,
  setCity,
  region,
  setRegion,
  postal,
  setPostal,
  country,
  setCountry,
  price,
  setPrice,
  errors = {},
}: {
  purchasedOn: string;
  setPurchasedOn: (v: string) => void;
  platform: PurchaseBatch["platform"];
  setPlatform: (v: PurchaseBatch["platform"]) => void;
  payment: PurchaseBatch["paymentMethod"];
  setPayment: (v: PurchaseBatch["paymentMethod"]) => void;
  orderNumber: string;
  setOrderNumber: (v: string) => void;
  sellerName: string;
  setSellerName: (v: string) => void;
  line1: string;
  setLine1: (v: string) => void;
  line2: string;
  setLine2: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  postal: string;
  setPostal: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  errors?: ReturnType<typeof validateBatch>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="batch-date">Date</Label>
          <Input id="batch-date" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
          {fieldError(errors.purchasedOn)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="batch-price">Price (£)</Label>
          <Input id="batch-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          {fieldError(errors.price)}
        </div>
        <div className="space-y-2">
          <Label>Platform</Label>
          <Select
            value={platform}
            onValueChange={(v) => {
              const next = v as PurchaseBatch["platform"];
              setPlatform(next);
              const allowed = paymentsForPlatform(next);
              if (!allowed.includes(payment)) setPayment(allowed[0]);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Payment method</Label>
          <Select value={payment} onValueChange={(v) => setPayment(v as PurchaseBatch["paymentMethod"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_PAYMENTS.filter((p) => paymentsForPlatform(platform).includes(p.value)).map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError(errors.paymentMethod)}
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="batch-order">Order number {platform === "ebay" ? "" : "(optional)"}</Label>
          <Input id="batch-order" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          {fieldError(errors.orderNumber)}
        </div>
      </div>
      <p className="text-sm font-semibold">Seller</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="seller-name">Name</Label>
          <Input id="seller-name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} required />
          {fieldError(errors.sellerName)}
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="seller-line1">Address line 1</Label>
          <Input id="seller-line1" value={line1} onChange={(e) => setLine1(e.target.value)} required />
          {fieldError(errors.sellerLine1)}
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="seller-line2">Address line 2</Label>
          <Input id="seller-line2" value={line2} onChange={(e) => setLine2(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-city">Town / city</Label>
          <Input id="seller-city" value={city} onChange={(e) => setCity(e.target.value)} required />
          {fieldError(errors.sellerCity)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-region">County</Label>
          <Input id="seller-region" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-postal">Postcode</Label>
          <Input id="seller-postal" className="font-mono uppercase" value={postal} onChange={(e) => setPostal(e.target.value)} required />
          {fieldError(errors.sellerPostal)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-country">Country</Label>
          <Input id="seller-country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
    </>
  );
}

function CreateBatchForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (batch: PurchaseBatch) => void;
}) {
  const nextQuery = useQuery({
    queryKey: ["next-batch"],
    queryFn: () => nextBatchNumber(),
  });
  const [purchasedOn, setPurchasedOn] = useState(todayIso);
  const [platform, setPlatform] = useState<(typeof BATCH_PLATFORMS)[number]["value"]>("ebay");
  const [payment, setPayment] = useState<(typeof BATCH_PAYMENTS)[number]["value"]>("ebay_payments");
  const [orderNumber, setOrderNumber] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("GB");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof validateBatch>>({});

  useEffect(() => {
    setPurchasedOn(todayIso());
  }, []);

  const save = useMutation({
    mutationFn: () => {
      const issues = validateBatch({
        purchasedOn,
        platform,
        paymentMethod: payment,
        orderNumber,
        sellerName,
        sellerLine1: line1,
        sellerCity: city,
        sellerPostal: postal,
        sellerCountry: country,
        price,
      });
      setErrors(issues);
      const problem = firstBatchError(issues);
      if (problem) throw new Error(problem);
      return createBatch({
        data: {
          purchasedOn,
          platform,
          paymentMethod: payment,
          orderNumber,
          sellerName,
          sellerLine1: line1,
          sellerLine2: line2,
          sellerCity: city,
          sellerRegion: region,
          sellerPostal: postal,
          sellerCountry: country,
          price: Number(price),
        },
      });
    },
    onSuccess: (batch) => {
      toast.success(`${batch.batchNumber} created`);
      onCreated(batch);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create batch"),
  });

  return (
    <form
      className="mt-5 space-y-4 rounded-md bg-surface-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm font-semibold">New batch</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Batch number</Label>
          <Input readOnly className="font-mono" value={nextQuery.data ?? "BAT-001"} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="batch-date">Date</Label>
          <Input id="batch-date" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Platform</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Payment method</Label>
          <Select value={payment} onValueChange={(v) => setPayment(v as typeof payment)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_PAYMENTS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="batch-order">Order number (optional)</Label>
          <Input id="batch-order" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="batch-price">Price (£)</Label>
          <Input
            id="batch-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <p className="text-sm font-semibold">Seller</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="seller-name">Name</Label>
          <Input id="seller-name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} required />
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="seller-line1">Address line 1</Label>
          <Input id="seller-line1" value={line1} onChange={(e) => setLine1(e.target.value)} required />
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="seller-line2">Address line 2</Label>
          <Input id="seller-line2" value={line2} onChange={(e) => setLine2(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-city">Town / city</Label>
          <Input id="seller-city" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-region">County</Label>
          <Input id="seller-region" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-postal">Postcode</Label>
          <Input id="seller-postal" className="font-mono uppercase" value={postal} onChange={(e) => setPostal(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seller-country">Country</Label>
          <Input id="seller-country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          <Plus />
          Create batch
        </Button>
      </div>
    </form>
  );
}
