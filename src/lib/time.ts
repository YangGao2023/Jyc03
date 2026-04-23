const EASTERN_TIME_ZONE = "America/New_York";

const easternDateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const easternDateTimeShort = new Intl.DateTimeFormat("zh-CN", {
  timeZone: EASTERN_TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatEasternTime(value?: string | null, short = false) {
  if (!value) return "-";
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return value;
  return (short ? easternDateTimeShort : easternDateTime).format(new Date(millis));
}
