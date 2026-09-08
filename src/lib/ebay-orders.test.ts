import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEbayOrderDetail, parseEbayOrdersXml } from "./ebay-orders.ts";

describe("parseEbayOrdersXml", () => {
  it("reads seller orders, money and SKU lines", () => {
    const xml = `<?xml version="1.0"?>
<GetOrdersResponse>
  <Ack>Success</Ack>
  <OrderArray>
    <Order>
      <OrderID>12-345-678</OrderID>
      <OrderStatus>Completed</OrderStatus>
      <CreatedTime>2026-08-20T10:00:00.000Z</CreatedTime>
      <BuyerUserID>brickfan</BuyerUserID>
      <AmountPaid currencyID="GBP">42.50</AmountPaid>
      <Total currencyID="GBP">42.50</Total>
      <TransactionArray>
        <Transaction>
          <Item>
            <ItemID>111</ItemID>
            <Title>LEGO 75192 Millennium Falcon</Title>
            <SKU>GBB-SET-75192-0001</SKU>
          </Item>
          <QuantityPurchased>1</QuantityPurchased>
          <TransactionPrice currencyID="GBP">42.50</TransactionPrice>
        </Transaction>
      </TransactionArray>
    </Order>
  </OrderArray>
</GetOrdersResponse>`;
    const orders = parseEbayOrdersXml(xml, "EBAY_GB");
    assert.equal(orders.length, 1);
    assert.equal(orders[0].id, "12-345-678");
    assert.equal(orders[0].channel, "ebay");
    assert.equal(orders[0].buyer, "brickfan");
    assert.equal(orders[0].total, 42.5);
    assert.equal(orders[0].currency, "GBP");
    assert.equal(orders[0].items[0].sku, "GBB-SET-75192-0001");
    assert.match(orders[0].url, /ebay\.co\.uk/);
  });

  it("pulls shipping address into the in-app order", () => {
    const xml = `<?xml version="1.0"?>
<GetOrdersResponse>
  <Ack>Success</Ack>
  <OrderArray>
    <Order>
      <OrderID>99-1</OrderID>
      <OrderStatus>Shipped</OrderStatus>
      <CreatedTime>2026-08-20T10:00:00.000Z</CreatedTime>
      <PaidTime>2026-08-20T11:00:00.000Z</PaidTime>
      <BuyerUserID>brickfan</BuyerUserID>
      <PaymentMethod>PayPal</PaymentMethod>
      <Total currencyID="GBP">50.00</Total>
      <Subtotal currencyID="GBP">42.50</Subtotal>
      <ShippingAddress>
        <Name>Sam Buyer</Name>
        <Street1>1 Brick Lane</Street1>
        <CityName>London</CityName>
        <PostalCode>E1 6AA</PostalCode>
        <CountryName>United Kingdom</CountryName>
      </ShippingAddress>
      <ShippingServiceSelected>
        <ShippingService>UK_OtherCourier</ShippingService>
        <ShippingServiceCost currencyID="GBP">7.50</ShippingServiceCost>
      </ShippingServiceSelected>
    </Order>
  </OrderArray>
</GetOrdersResponse>`;
    const detail = parseEbayOrderDetail(xml, "EBAY_GB");
    assert.equal(detail.address?.name, "Sam Buyer");
    assert.equal(detail.address?.city, "London");
    assert.equal(detail.shippingCost, 7.5);
    assert.equal(detail.subtotal, 42.5);
    assert.equal(detail.payment, "PayPal");
  });
});
