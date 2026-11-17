/** Контекст вызывающей стороны для API-запросов (соответствует dental_session после входа). */
export interface DentalGwActor {
  role: "client" | "doctor" | "admin";
  id: string;
  phone?: string;
}
