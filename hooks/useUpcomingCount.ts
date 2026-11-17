"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { getUpcomingCount, hasAppointmentsCache, initAppointments } from "@/lib/appointments";

export function useUpcomingCount(): number {
  const [count, setCount] = useState(0);

  useLayoutEffect(() => {
    if (hasAppointmentsCache()) {
      setCount(getUpcomingCount());
    }
  }, []);

  useEffect(() => {
    void initAppointments().then(() => setCount(getUpcomingCount()));

    const update = () => setCount(getUpcomingCount());

    window.addEventListener("appointmentsUpdated", update);
    window.addEventListener("storage", update);

    return () => {
      window.removeEventListener("appointmentsUpdated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return count;
}
