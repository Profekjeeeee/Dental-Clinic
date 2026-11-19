import "server-only";

import {
  loadClient,
  loadEmployee,
  safeDentalScalarId,
  type DentalServiceContext,
} from "@/lib/server/services/shared/accessControl";

export async function refreshDentalCaches(ctx: DentalServiceContext) {
  const { adm, gate, actor } = ctx;

  if (!actor?.id?.trim()) return { dental_clients: [], dental_employees: [] };

  if (actor.role === "doctor" || actor.role === "admin") {
    const employee = await loadEmployee(adm, actor, gate);
    const clinicId = safeDentalScalarId(employee.clinic_id, "clinic");
    const [clientsRes, empRes] = await Promise.all([
      adm.from("dental_clients").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: true }),
      adm.from("dental_employees").select("*").eq("clinic_id", clinicId).order("name", { ascending: true }),
    ]);
    if (clientsRes.error) throw clientsRes.error;
    if (empRes.error) throw empRes.error;
    return { dental_clients: clientsRes.data ?? [], dental_employees: empRes.data ?? [] };
  }

  if (actor.role === "client") {
    const client = await loadClient(adm, actor, gate);
    const clinicId = safeDentalScalarId(client.clinic_id, "clinic");
    const { data: empRows, error } = await adm.from("dental_employees")
      .select("id, name, first_name, last_name, role, specialization")
      .eq("clinic_id", clinicId).eq("role", "doctor").order("name");
    if (error) throw error;

    const clientsArr = [{
      id: client.id,
      phone: client.phone,
      name: client.name,
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      formula_teeth: client.formula_teeth,
    }];
    return { dental_clients: clientsArr, dental_employees: empRows ?? [] };
  }

  return { dental_clients: [], dental_employees: [] };
}
