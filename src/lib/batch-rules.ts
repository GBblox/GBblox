import type { BatchPayment, BatchPlatform } from "./types";

const GB_POSTCODE =
  /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export type BatchInput = {
  purchasedOn: string;
  platform: BatchPlatform;
  paymentMethod: BatchPayment;
  orderNumber: string;
  sellerName: string;
  sellerLine1: string;
  sellerCity: string;
  sellerPostal: string;
  sellerCountry: string;
  price: number | string;
};

export type BatchFieldErrors = Partial<Record<keyof BatchInput | "price", string>>;

export function paymentsForPlatform(platform: BatchPlatform): BatchPayment[] {
  if (platform === "ebay") return ["ebay_payments", "paypal"];
  return ["cash", "paypal", "stripe"];
}

export function validateBatch(input: BatchInput): BatchFieldErrors {
  const errors: BatchFieldErrors = {};
  const date = input.purchasedOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.purchasedOn = "Pick a purchase date.";
  } else {
    const picked = new Date(`${date}T00:00:00`);
    const tomorrow = new Date();
    tomorrow.setHours(23, 59, 59, 999);
    if (picked.getTime() > tomorrow.getTime()) errors.purchasedOn = "Date cannot be in the future.";
  }

  const amount = typeof input.price === "number" ? input.price : Number(String(input.price).replace(/,/g, ""));
  if (!Number.isFinite(amount)) errors.price = "Enter the price in pounds.";
  else if (amount < 0) errors.price = "Price cannot be negative.";
  else if (amount > 999_999) errors.price = "Price is too large.";

  if (!paymentsForPlatform(input.platform).includes(input.paymentMethod)) {
    errors.paymentMethod =
      input.platform === "ebay"
        ? "eBay batches must use eBay Payments or PayPal."
        : "That payment method is not used on this platform.";
  }

  if (input.platform === "ebay" && !input.orderNumber.trim()) {
    errors.orderNumber = "eBay batches need an order number.";
  }

  if (!input.sellerName.trim()) errors.sellerName = "Enter the seller name.";
  if (!input.sellerLine1.trim()) errors.sellerLine1 = "Enter address line 1.";
  if (!input.sellerCity.trim()) errors.sellerCity = "Enter the town or city.";
  const postal = input.sellerPostal.trim().toUpperCase();
  if (!postal) errors.sellerPostal = "Enter the postcode.";
  else if ((input.sellerCountry || "GB").toUpperCase() === "GB" && !GB_POSTCODE.test(postal)) {
    errors.sellerPostal = "Use a UK postcode, e.g. DH7 7JQ.";
  }

  return errors;
}

export function firstBatchError(errors: BatchFieldErrors): string | null {
  return Object.values(errors).find(Boolean) ?? null;
}

export function normalizePostcode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

export function assertBatchValid(input: BatchInput): void {
  const problem = firstBatchError(validateBatch(input));
  if (problem) throw new Error(problem);
}

export function isBatchNumber(raw: string): boolean {
  return /^BAT-\d{3,}$/i.test(raw.trim());
}
