import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Онлайн-оплата временно недоступна." }, { status: 503 });
}
