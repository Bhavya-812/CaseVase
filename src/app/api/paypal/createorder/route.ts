"use server";

import { BASE_PRICE, PRODUCT_PRICES } from "@/config/products";
import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import paypal from "@paypal/checkout-server-sdk";
import client from "../../../utils/paypal";
import { Order } from "@prisma/client";
import { NextResponse, NextRequest } from "next/server";

export const POST = async (request: NextRequest) => {
  try {
    const { configId } = await request.json();
    const configuration = await db.configuration.findUnique({
      where: {
        id: configId.id,
      },
    });
    if (!configuration) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { finish, material } = configuration;

    let price = BASE_PRICE;
    if (finish === "textured") {
      price += PRODUCT_PRICES.finish.textured;
    }
    if (material === "polycarbonate") {
      price += PRODUCT_PRICES.material.polycarbonate;
    }

    let order: Order | undefined = undefined;

    const existingOrder = await db.order.findFirst({
      where: {
        userId: user.id,
        configurationId: configuration.id,
      },
    });

    if (existingOrder) {
      order = existingOrder;
    } else {
      order = await db.order.create({
        data: {
          amount: price / 100,
          userId: user.id,
          configurationId: configuration.id,
        },
      });
    }

    const formattedPrice = (price / 100).toFixed(2);
    const paypalRequest = new paypal.orders.OrdersCreateRequest();
    paypalRequest.prefer("return=representation");
    paypalRequest.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          amount: {
            currency_code: "USD",
            value: formattedPrice,
            breakdown: {
              item_total: {
                currency_code: "USD",
                value: formattedPrice,
              },
              discount: {
                currency_code: "USD",
                value: "0.00",
              },
              handling: {
                currency_code: "USD",
                value: "0.00",
              },
              insurance: {
                currency_code: "USD",
                value: "0.00",
              },
              shipping_discount: {
                currency_code: "USD",
                value: "0.00",
              },
              shipping: {
                currency_code: "USD",
                value: "0.00",
              },
              tax_total: {
                currency_code: "USD",
                value: "0.00",
              },
            },
          },
          items: [
            {
              name: "Customized product",
              unit_amount: {
                currency_code: "USD",
                value: formattedPrice,
              },
              quantity: "1",
              category: "PHYSICAL_GOODS",
            },
          ],
        },
      ],
    });

    const response = await client.execute(paypalRequest);
    return NextResponse.json(
      {
        orderId: response.result.id,
        order: order,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
