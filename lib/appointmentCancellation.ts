export const CLIENT_CANCEL_MARKER = "[Отменено клиентом]";
export const DOCTOR_CANCEL_MARKER = "[Отменено врачом]";

export type CancellationActor = "client" | "doctor";

export function extractCancellationActor(
  comment: unknown
): CancellationActor | null {
  if (typeof comment !== "string" || !comment) return null;
  if (comment.includes(CLIENT_CANCEL_MARKER)) return "client";
  if (comment.includes(DOCTOR_CANCEL_MARKER)) return "doctor";
  return null;
}

export function stripCancellationMarkers(comment: unknown): string {
  if (typeof comment !== "string" || !comment) return "";
  return comment
    .replace(CLIENT_CANCEL_MARKER, "")
    .replace(DOCTOR_CANCEL_MARKER, "")
    .trim();
}

export function withCancellationMarker(
  existingComment: unknown,
  actor: CancellationActor
): string {
  const clean = stripCancellationMarkers(existingComment);
  const marker = actor === "client" ? CLIENT_CANCEL_MARKER : DOCTOR_CANCEL_MARKER;
  return clean ? `${clean}\n${marker}` : marker;
}
