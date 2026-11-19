import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Поиск профиля по телефону отключён." }, { status: 410 });
}
