export type DateRange = {
  startDate: string;
  endDate: string;
};

function todayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getWeekRange(): DateRange {
  const today = todayUTC();
  const dayOfWeek = today.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysFromMonday);

  return {
    startDate: toDateString(monday),
    endDate: toDateString(today),
  };
}

export function getMonthRange(): DateRange {
  const today = todayUTC();
  const firstDay = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );

  return {
    startDate: toDateString(firstDay),
    endDate: toDateString(today),
  };
}

export function getYearRange(): DateRange {
  const today = todayUTC();
  const firstDay = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  return {
    startDate: toDateString(firstDay),
    endDate: toDateString(today),
  };
}

export function generateDateRange(
  startDate: string,
  endDate: string,
): string[] {
  const labels: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const current = new Date(start);

  while (current <= end) {
    labels.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return labels;
}
